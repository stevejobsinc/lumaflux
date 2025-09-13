#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform vec2 u_resolution;
void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec3 col = texture(u_tex, uv).rgb;
    fragColor = vec4(col, 1.0);
}


