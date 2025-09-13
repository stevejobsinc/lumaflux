#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bpm;
uniform vec2 u_mouse;
uniform sampler2D u_texture0; // optional user image
uniform bool u_hasTexture;
uniform vec2 u_sourceSize; // video/image size in pixels (w,h). 0 when unset
uniform int u_fitMode;     // 0: cover, 1: contain, 2: stretch

uniform float u_zoom;
uniform float u_rotate;
uniform float u_warp;
uniform float u_flow;
uniform float u_colorSpeed;
uniform float u_texMix;
uniform int u_segments; // kaleidoscope segments
uniform bool u_enableKaleido;
uniform bool u_enableWarp;
uniform bool u_enableColor;
// Flow advection controls (used by feedback shader; here for preview influence)
uniform bool u_enableFlowAdvect;
uniform float u_flowMix;     // 0..1, edges vs curl (placeholder in compose)
uniform float u_advectStrength; // used subtly in compose for preview
uniform float u_curlScale;
uniform float u_curlSpeed;
// Chroma & kaleido mask
uniform bool u_enableChromaFlow;
uniform float u_chromaAmt;
uniform float u_kInner;
uniform float u_kOuter;

// MirrorGrid tiling (pre-kaleidoscope)
uniform bool u_enableTile;
uniform vec2 u_tileCount;
uniform bool u_tileMirror;

// Hash/Noise helpers (cheap, mobile-friendly)
float hash11(float p){
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash21(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
    float v = 0.0;
    float amp = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for(int i=0; i<5; i++){
        v += amp * noise(p);
        p = m * p;
        amp *= 0.5;
    }
    return v;
}

// HSV -> RGB (iq's variant)
vec3 hsv2rgb(vec3 c){
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

// Kaleidoscope mapping: reflect angle into [0, segAngle]
vec2 kaleidoscope(vec2 p, int segments, float rotation){
    float ang = atan(p.y, p.x) + rotation;
    float rad = length(p);
    float segAngle = 3.14159265359 * 2.0 / float(segments);
    ang = mod(ang, segAngle);
    ang = abs(ang - 0.5 * segAngle);
    return vec2(cos(ang), sin(ang)) * rad;
}

void main(){
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

    // Mouse-influenced focus
    vec2 m = (u_mouse - 0.5 * u_resolution.xy) / max(1.0, u_resolution.y);
    float focus = clamp(length(m) * 2.0, 0.0, 1.0);

    // Zoom and rotate in screen space
    float c = cos(u_rotate);
    float s = sin(u_rotate);
    mat2 R = mat2(c, -s, s, c);
    vec2 p = R * (uv * (1.0 / max(0.001, u_zoom)));

    // Optional MirrorGrid tiling before kaleidoscope
    if(u_enableTile){
        vec2 tp = p * u_tileCount;
        vec2 cell = floor(tp);
        vec2 f = fract(tp) - 0.5;
        if(u_tileMirror){
            vec2 parity = mod(cell, 2.0);
            vec2 sgn = mix(vec2(-1.0), vec2(1.0), parity);
            f *= sgn;
        }
        p = f;
    }

    // Kaleidoscopic mapping (allow 0 segments to disable) with radial mask
    float radius = length(p);
    float mask = smoothstep(u_kInner, u_kOuter, radius); // 0 inside, 1 outside
    if(u_enableKaleido && u_segments > 0){
        vec2 pk = kaleidoscope(p, u_segments, u_rotate * 0.25);
        p = mix(p, pk, mask);
    }

    // Flowing domain warp using fbm and sine (compose preview)
    float t = u_time * u_flow;
    float n = fbm(p * 1.8 + vec2(t * 0.1, -t * 0.07));
    if(u_enableWarp){
        vec2 warp = vec2(
            sin(3.0 * p.y + t) + n,
            cos(3.0 * p.x - t) - n
        );
        p += u_warp * 0.25 * warp;
        // subtle preview of flow-based offset so user sees effect without feedback
        if(u_enableFlowAdvect){
            vec2 dir = normalize(vec2(
                sin(p.y * u_curlScale + t * u_curlSpeed),
                -sin(p.x * u_curlScale - t * u_curlSpeed)
            ));
            p += dir * (u_advectStrength * 0.2 * u_flowMix);
        }
    }

    // Base psychedelic palette (cosine palette)
    float r = length(p);
    float band = 0.5 + 0.5 * cos(12.0 * r - t * 2.0 + n * 6.2831);
    vec3 base = 0.5 + 0.5 * cos(6.28318 * (vec3(0.23, 0.33, 0.77) * (band + t * 0.1) + vec3(0.0, 0.33, 0.67)));

    // Optional texture sampling mixed in polar fashion
    vec3 texCol = vec3(0.0);
    if(u_hasTexture){
        // Map kaleidoscopic coords into [0,1] with aspect-ratio aware fit
        vec2 tuv = p; // -1..1 roughly
        // Compute scale to fit source into square according to mode
        float srcAspect = (u_sourceSize.x > 0.0 && u_sourceSize.y > 0.0) ? (u_sourceSize.x / u_sourceSize.y) : 1.0;
        vec2 scale = vec2(1.0);
        if(u_fitMode != 2){ // not stretch
            // We want to map square space to source aspect
            // For cover: scale down the smaller dimension less (max), for contain: min
            if(u_fitMode == 0){ // cover
                scale = (srcAspect >= 1.0) ? vec2(srcAspect, 1.0) : vec2(1.0, 1.0/srcAspect);
            }else{ // contain
                scale = (srcAspect >= 1.0) ? vec2(1.0, 1.0/srcAspect) : vec2(srcAspect, 1.0);
            }
        }
        tuv = (tuv / scale) * 0.5 + 0.5;
        // Flow-based chromatic offset
        vec2 flowDir = normalize(vec2(
            sin(p.y * u_curlScale + t * u_curlSpeed),
            -sin(p.x * u_curlScale - t * u_curlSpeed)
        ));
        vec2 du = (u_enableChromaFlow ? flowDir : vec2(1.0,0.0));
        float off = (0.002 + 0.01 * (1.0 - focus)) * u_chromaAmt;
        float rC = texture(u_texture0, tuv + du * off).r;
        float gC = texture(u_texture0, tuv).g;
        float bC = texture(u_texture0, tuv - du * off).b;
        texCol = vec3(rC, gC, bC);
    }

    // Combine
    vec3 col = mix(base, texCol, u_hasTexture ? u_texMix : 0.0);

    // Time-varying HSV hue shift
    if(u_enableColor){
        float hue = fract(u_colorSpeed * u_time * 0.05 + 0.15 * band + 0.1 * n);
        vec3 hsv = vec3(hue, 0.9, 0.9);
        col = mix(col, hsv2rgb(hsv), 0.35);
    }

    // Vignette
    float vign = smoothstep(1.25, 0.2, length(uv));
    col *= vign;

    fragColor = vec4(col, 1.0);
}


