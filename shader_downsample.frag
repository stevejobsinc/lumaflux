#version 300 es
precision highp float;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform vec2 u_resolution;      // destination resolution
uniform vec2 u_srcResolution;   // source resolution

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 texel = 1.0 / u_srcResolution;
    // 2x2 box average in source space
    vec3 c = vec3(0.0);
    c += texture(u_tex, uv + texel * vec2(-0.25, -0.25)).rgb;
    c += texture(u_tex, uv + texel * vec2( 0.25, -0.25)).rgb;
    c += texture(u_tex, uv + texel * vec2(-0.25,  0.25)).rgb;
    c += texture(u_tex, uv + texel * vec2( 0.25,  0.25)).rgb;
    c *= 0.25;
    // Keep luminance in R for compatibility; replicate to RGB
    float l = c.r;
    fragColor = vec4(vec3(l), 1.0);
}


