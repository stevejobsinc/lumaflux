#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform float u_threshold; // 0..1

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec3 col = texture(u_tex, uv).rgb;
    float l = dot(col, vec3(0.2126,0.7152,0.0722));
    vec3 bright = max(col - u_threshold, 0.0) / max(1.0 - u_threshold, 1e-5);
    fragColor = vec4(bright, 1.0);
}


