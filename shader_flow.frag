#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bpm;
uniform sampler2D u_analysis; // from prepass: r=luminance, g=edge mag, ba=grad dir
uniform float u_flowMix;      // 0..1 blend of edge-tangent vs curl noise
uniform float u_curlScale;
uniform float u_curlSpeed;

// Cheap value noise
float hash21(vec2 p){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash21(i);
    float b=hash21(i+vec2(1,0));
    float c=hash21(i+vec2(0,1));
    float d=hash21(i+vec2(1,1));
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

// Curl of a 2D noise field via finite differences
vec2 curlNoise(vec2 p){
    float e = 0.0015;
    float n1 = noise(p + vec2(0.0, e));
    float n2 = noise(p - vec2(0.0, e));
    float n3 = noise(p + vec2(e, 0.0));
    float n4 = noise(p - vec2(e, 0.0));
    float dx = (n1 - n2) / (2.0*e);
    float dy = (n3 - n4) / (2.0*e);
    return vec2(dy, -dx);
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 a = texture(u_analysis, uv);
    float edgeMag = a.g;           // 0..1
    vec2 gradDir = normalize(a.ba * 2.0 - 1.0);
    vec2 tangent = vec2(-gradDir.y, gradDir.x);

    // Curl noise field in screen space
    vec2 p = (gl_FragCoord.xy / u_resolution.y) * u_curlScale + vec2(0.0, u_time * u_curlSpeed * 0.25);
    vec2 curl = curlNoise(p);

    // Blend tangent (strong where edges) with curl turbulence
    vec2 flow = mix(curl, tangent, u_flowMix) * (0.2 + 0.8 * edgeMag);

    // Pack flow into RG, leave BA for debug/unused
    fragColor = vec4(flow * 0.5 + 0.5, edgeMag, 1.0);
}


