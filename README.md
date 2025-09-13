LumaFlux
=========

Real-time, optical-flow–driven bloom + feedback shader demo for the web.

This project showcases a modern GLSL pipeline featuring prepass, optical flow, multi-pass blur, thresholding, and bloom compositing, all wired up in a simple, hackable WebGL app. Ideal as a reference or a starting point for shader experiments and interactive visuals.

Screenshot
----------
![LumaFlux Screenshot](Screenshots/frame-1757675272018.png)

Features
--------
- Optical flow estimation and flow-driven feedback
- Multi-pass separable blur and downsample chain
- Thresholded bloom and compositing
- Organized GLSL shader stages for clarity
- One-command deploy via GitHub Pages workflow

Getting Started
---------------
You can run this locally with any static server. Examples:

```bash
# Python
python3 -m http.server 8000

# Node
npx http-server . -p 8000 --silent
```

Then open `http://localhost:8000`.

Deployment
----------
This repository includes a GitHub Actions workflow to deploy the site to GitHub Pages on every push to `main`. No configuration needed after the repo is created—first push will trigger a deploy.

Project Structure
-----------------
- `index.html`, `main.js`: minimal WebGL app bootstrap
- Shaders:
  - `shader.vert`, `shader.frag`
  - `shader_prepass.frag`, `shader_optflow.frag`, `shader_flow.frag`, `shader_flow_add.frag`, `shader_flow_combine.frag`
  - `shader_downsample.frag`, `shader_blurH.frag`, `shader_blurV.frag`
  - `shader_threshold.frag`, `shader_bloom.frag`, `shader_blit.frag`, `shader_feedback.frag`

License
-------
MIT — see `LICENSE` for details.


