#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform sampler2D u_texture0; // source image
uniform vec2 u_sourceSize; // (w,h)
uniform int u_fitMode;     // 0 cover, 1 contain, 2 stretch

// Outputs:
//   r: luminance
//   g: edge magnitude (Sobel)
//   ba: normalized gradient direction (encoded in unit vector)

float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

void main(){
    vec2 texel = 1.0 / u_resolution;
    vec2 uv = gl_FragCoord.xy / u_resolution;
    // Apply same fit mapping as compose so analysis matches sampling
    float srcAspect = (u_sourceSize.x > 0.0 && u_sourceSize.y > 0.0) ? (u_sourceSize.x / u_sourceSize.y) : 1.0;
    vec2 scale = vec2(1.0);
    if(u_fitMode != 2){
        if(u_fitMode == 0){ // cover
            scale = (srcAspect >= 1.0) ? vec2(srcAspect, 1.0) : vec2(1.0, 1.0/srcAspect);
        } else { // contain
            scale = (srcAspect >= 1.0) ? vec2(1.0, 1.0/srcAspect) : vec2(srcAspect, 1.0);
        }
    }
    vec2 tuv = (uv - 0.5) * 2.0; // -1..1
    tuv = (tuv / scale) * 0.5 + 0.5; // back to 0..1
    vec3 c00 = texture(u_texture0, tuv + texel * vec2(-1.0,-1.0)).rgb;
    vec3 c10 = texture(u_texture0, tuv + texel * vec2( 0.0,-1.0)).rgb;
    vec3 c20 = texture(u_texture0, tuv + texel * vec2( 1.0,-1.0)).rgb;
    vec3 c01 = texture(u_texture0, tuv + texel * vec2(-1.0, 0.0)).rgb;
    vec3 c11 = texture(u_texture0, tuv + texel * vec2( 0.0, 0.0)).rgb;
    vec3 c21 = texture(u_texture0, tuv + texel * vec2( 1.0, 0.0)).rgb;
    vec3 c02 = texture(u_texture0, tuv + texel * vec2(-1.0, 1.0)).rgb;
    vec3 c12 = texture(u_texture0, tuv + texel * vec2( 0.0, 1.0)).rgb;
    vec3 c22 = texture(u_texture0, tuv + texel * vec2( 1.0, 1.0)).rgb;

    float L00=lum(c00), L10=lum(c10), L20=lum(c20);
    float L01=lum(c01), L11=lum(c11), L21=lum(c21);
    float L02=lum(c02), L12=lum(c12), L22=lum(c22);

    float gx = -L00 - 2.0*L01 - L02 + L20 + 2.0*L21 + L22;
    float gy = -L00 - 2.0*L10 - L20 + L02 + 2.0*L12 + L22;
    vec2 grad = vec2(gx, gy);
    float mag = clamp(length(grad) * 0.25, 0.0, 1.0);
    vec2 dir = normalize(grad + 1e-5);

    float l = L11;
    fragColor = vec4(l, mag, dir * 0.5 + 0.5);
}


