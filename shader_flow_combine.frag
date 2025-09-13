#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_a;   // synthetic flow RG (0.5 is zero)
uniform sampler2D u_b;   // optical flow RG (0.5 is zero)
uniform float u_mix;     // 0..1, weight of optical
uniform vec2 u_resolution;

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 a = texture(u_a, uv).rg;
    vec2 b = texture(u_b, uv).rg;
    vec2 m = mix(a, b, clamp(u_mix, 0.0, 1.0));
    fragColor = vec4(m, 0.0, 1.0);
}


