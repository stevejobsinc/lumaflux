#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform sampler2D u_prevLuma;  // previous luminance buffer
uniform sampler2D u_currLuma;  // current luminance buffer
uniform int u_radius;          // 1..3 (3x3..7x7)
uniform float u_scale;         // vector scale

// Lucas–Kanade optical flow (single-scale, windowed least squares)
void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec2 texel = 1.0 / u_resolution;

    int r = clamp(u_radius, 1, 3);

    float A11 = 0.0; // sum Ix*Ix
    float A12 = 0.0; // sum Ix*Iy
    float A22 = 0.0; // sum Iy*Iy
    float b1  = 0.0; // -sum Ix*It
    float b2  = 0.0; // -sum Iy*It

    for(int j=-3;j<=3;j++){
        if(j<-r || j>r) continue;
        for(int i=-3;i<=3;i++){
            if(i<-r || i>r) continue;
            vec2 o = vec2(float(i), float(j)) * texel;
            // Spatial gradients from current frame (Scharr-ish weights simplified)
            float Lx = (texture(u_currLuma, uv + o + vec2(texel.x,0.0)).r - texture(u_currLuma, uv + o - vec2(texel.x,0.0)).r) * 0.5;
            float Ly = (texture(u_currLuma, uv + o + vec2(0.0,texel.y)).r - texture(u_currLuma, uv + o - vec2(0.0,texel.y)).r) * 0.5;
            float It = texture(u_currLuma, uv + o).r - texture(u_prevLuma, uv + o).r;

            A11 += Lx*Lx;
            A12 += Lx*Ly;
            A22 += Ly*Ly;
            b1  += -Lx*It;
            b2  += -Ly*It;
        }
    }

    // Solve 2x2 system [A]{v}={b}
    float det = A11*A22 - A12*A12 + 1e-6;
    vec2 v = vec2(
        ( A22*b1 - A12*b2) / det,
        (-A12*b1 + A11*b2) / det
    );
    v *= u_scale; // scale to taste

    // Pack flow to RG 0..1 with 0.5 as zero. BA: luma variance and 1.0
    vec2 flow = clamp(v * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(flow, 0.0, 1.0);
}


