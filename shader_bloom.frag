#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_scene;     // original scene
uniform sampler2D u_blur;      // blurred bright areas
uniform vec2 u_resolution;
uniform bool u_enableBloom;
uniform float u_intensity;     // 0..3

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec3 base = texture(u_scene, uv).rgb;
    vec3 bloom = texture(u_blur, uv).rgb;
    vec3 col = base + (u_enableBloom ? bloom * u_intensity : vec3(0.0));
    fragColor = vec4(col, 1.0);
}


