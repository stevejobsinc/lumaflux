#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform float u_radius; // 0.5..3

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 texel = 1.0 / u_resolution;
    float r = u_radius * 2.0; // small kernel
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for(int i=-6;i<=6;i++){
        float x = float(i);
        float w = exp(-0.5 * (x*x) / (r*r));
        sum += texture(u_tex, uv + vec2(x,0.0) * texel).rgb * w;
        wsum += w;
    }
    fragColor = vec4(sum / max(wsum, 1e-5), 1.0);
}


