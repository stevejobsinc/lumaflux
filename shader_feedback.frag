#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_prev;     // previous accumulated frame
uniform sampler2D u_current;  // freshly composed frame
uniform sampler2D u_flowTex;  // flow vector field (RG)
uniform float u_decay;        // 0.80..0.999
uniform float u_zoomRate;     // small value ~0.002..0.01
uniform float u_rotateRate;   // small value ~-0.02..0.02
uniform bool u_enableFeedback;
uniform bool u_enableAdvect;
uniform float u_advectStrength; // pixels per frame in screen space

// Spiral Tunnel (log-polar) + Orbital Echoes
uniform bool u_enablePolar;
uniform float u_polarScale;
uniform float u_polarTwist;
uniform int u_echoTaps;
uniform float u_echoMix;
uniform float u_echoAngle;

// Auto-gain controls
uniform bool u_enableAutoGain;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // Transform to center for zoom/rotate or log-polar tunnel
    vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    vec2 q;
    if(u_enablePolar){
        float r = length(p) + 1e-6;
        float a = atan(p.y, p.x);
        vec2 lp = vec2(log(r) * u_polarScale, a);
        lp.x += u_zoomRate * 36.0; // zoom progresses logarithmic radius
        lp.y += u_rotateRate + u_polarTwist * r;
        float rr = exp(lp.x / u_polarScale);
        float aa = lp.y;
        q = vec2(cos(aa), sin(aa)) * rr;
    } else {
        float angle = u_rotateRate;
        float c = cos(angle), s = sin(angle);
        mat2 R = mat2(c, -s, s, c);
        q = R * (p * (1.0 + u_zoomRate));
    }
    vec2 prevUV = q * (u_resolution.y / u_resolution) + 0.5;

    if(u_enableAdvect){
        // Sample flow and advect previous UV opposite to flow (backtrace)
        vec2 flow = texture(u_flowTex, uv).rg * 2.0 - 1.0;
        if(u_enableAutoGain){
            float m = length(flow);
            // Normalize and apply soft gain to mitigate huge jumps while keeping direction
            if(m > 1e-5){ flow = normalize(flow) * clamp(m, 0.0, 1.5); }
        }
        prevUV -= flow * (u_advectStrength / u_resolution);
    }

    vec3 prevCol = texture(u_prev, prevUV).rgb;
    if(u_echoTaps > 0){
        float ca = cos(u_echoAngle), sa = sin(u_echoAngle);
        mat2 Rpos = mat2(ca, -sa, sa, ca);
        mat2 Rneg = mat2(ca,  sa, -sa, ca);
        vec2 q1 = Rpos * q;
        vec2 q2 = Rneg * q;
        vec2 uv1 = q1 * (u_resolution.y / u_resolution) + 0.5;
        vec2 uv2 = q2 * (u_resolution.y / u_resolution) + 0.5;
        vec3 echo = 0.5 * (texture(u_prev, uv1).rgb + texture(u_prev, uv2).rgb);
        prevCol = mix(prevCol, echo, clamp(u_echoMix, 0.0, 1.0));
    }
    vec3 curCol  = texture(u_current, uv).rgb;

    vec3 outCol = u_enableFeedback ? mix(curCol, prevCol, clamp(u_decay, 0.0, 0.999)) : curCol;
    fragColor = vec4(outCol, 1.0);
}


