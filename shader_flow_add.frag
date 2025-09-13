#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_large;   // coarse flow (RG 0..1)
uniform sampler2D u_fine;    // fine flow (RG 0..1)
uniform vec2 u_resolution;   // destination resolution (fine)
uniform float u_largeWeight; // 0..1

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 fFine = texture(u_fine, uv).rg * 2.0 - 1.0;
    vec2 fLarge = texture(u_large, uv).rg * 2.0 - 1.0;
    vec2 f = mix(fFine, fLarge, clamp(u_largeWeight, 0.0, 1.0));
    f = clamp(f * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(f, 0.0, 1.0);
}


