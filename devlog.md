## 2025-09-12 — Initial psychedelic shader viewer

### 2025-09-12 — Startup and local server

What was done
- Started a local static server at `http://127.0.0.1:5173` to serve `index.html`, `main.js`, and shader files.
- Opened the app in the default browser and verified key assets (`/`, `/main.js`, `/shader.frag`) returned HTTP 200.

Why it was done
- Browsers block `fetch` of local files and impose CORS restrictions; shaders (`.vert/.frag`) are requested via `fetch` in `main.js`, so an HTTP server is required.
- Serving over HTTP avoids `file://` issues and ensures consistent caching behavior during development.

How it was done
- From the project root, started a server:
  - Node option (preferred): `npx --yes http-server -p 5173 -c-1`
  - Python fallback: `python3 -m http.server 5173 --bind 127.0.0.1`
- Opened the app: `open http://127.0.0.1:5173/`
- Spot-checked availability with `curl` HEAD requests to confirm HTTP 200 for `/`, `/main.js`, `/shader.frag`.

Run it again
- Node: `npx --yes http-server -p 5173 -c-1`
- Python: `python3 -m http.server 5173 --bind 127.0.0.1`
- Then visit `http://127.0.0.1:5173/`

Basis
- Static HTTP serving is the standard approach for local WebGL apps where resources are fetched. Disabling cache (`-c-1`) avoids stale shader code during iteration.

### 2025-09-12 — Video input (file + webcam) wired into pipeline

What was done
- Added Video section and hidden <video> element in `index.html` with buttons for "Load video" and "Use webcam".
- Implemented video texture initialization in `main.js` using `CLAMP_TO_EDGE` and `LINEAR` filters for NPOT safety.
- Added per-frame video upload via `gl.texImage2D(..., video)` guarded by frame timestamp to avoid redundant uploads.
- Prefer video texture when present; fallback to image texture. Prepass and compose now sample whichever input is active.
- Added webcam support via `getUserMedia`, with cleanup of tracks on stop, and basic status text.

Why it was done
- To allow dynamic content matching the original reference material and enable live visuals via camera.
- Ensures the existing multipass (prepass → flow → compose → feedback → bloom) can operate unchanged on video frames.

How it was done
- `index.html`: new controls (`#loadVideoBtn`, `#videoFile`, `#useWebcam`, status `#videoInfo`) and a hidden `<video id="video" playsinline muted loop>` inside `#glwrap`.
- `main.js`: created `videoTexture`, `hasVideo`, and helpers `initVideoTexture()`, `updateVideoTextureIfNeeded()`, `startVideo()`, `startWebcam()`, `stopVideo()`.
- Hooked UI events to file input and webcam; cleared still-image texture when a video source is activated to remove ambiguity.
- Updated draw paths to bind video texture in compose and prepass, and to mark analysis as dirty when a new frame arrives.

Basis
- WebGL2 supports uploading HTMLVideoElement frames directly via `texImage2D`. Using `CLAMP_TO_EDGE` + `LINEAR` avoids NPOT/mipmap constraints. Guarding uploads on `currentTime` prevents wasting bandwidth on static frames. `playsinline`/muted enables autoplay on mobile.

### 2025-09-12 — Aspect ratio fit modes and playback controls

What was done
- Added fit modes UI (Cover, Contain, Stretch) and playback controls (Play/Pause, Mute, Loop, Seek).
- Introduced new uniforms `u_sourceSize` and `u_fitMode` in `shader.frag` and `shader_prepass.frag` to ensure consistent sampling and analysis.
- Implemented aspect-aware UV mapping in compose and prepass: scales -1..1 coordinates to match source aspect per fit mode and converts to 0..1 texture space.
- Wired main.js to set source dimensions from either video or image inputs and pass fit mode integers.
- Implemented seek slider (0–1000) normalized across duration, reflected on `timeupdate`.

Why it was done
- Preserve content framing without unwanted stretching, and provide basic transport control for loaded videos.

How it was done
- HTML: added `<select id="fitMode">` and playback controls in the Video section.
- GLSL: added uniforms and applied scale mapping for cover/contain/stretch; prepass uses the same mapping so flow/edges align.
- JS: tracked source sizes for video (`videoWidth/Height`) and images; set uniforms in compose/prepass; added UI event handlers for play/pause, mute, loop, and seek.

Basis
- Using a consistent sampling transform across both display and analysis avoids edge/flow artifacts. Fit strategies follow standard media rendering semantics.

### 2025-09-12 — Status overlay and requestVideoFrameCallback optimization

What was done
- Added a lightweight status overlay (`#status`) to surface transient messages (load success, mute/loop toggles, webcam activation, autoplay blocked).
- Implemented `requestVideoFrameCallback` scheduling for video uploads when available, with a fallback to per-frame polling; added cancellation on stop.

Why it was done
- Provide immediate user feedback for media actions and errors.
- Reduce redundant texture uploads and sync GPU updates to actual video frame availability for efficiency.

How it was done
- HTML/CSS: added `.status` element inside `#glwrap`.
- JS: `showStatus/hideStatus` helpers; detect rVFC support; schedule/cancel callbacks around play/stop; guarded `updateVideoTextureIfNeeded` in the main loop when rVFC is active.

Basis
- rVFC ensures uploads happen on real frame boundaries, improving performance and A/V sync. Overlay improves UX without heavy UI frameworks.

### 2025-09-12 — Input handling refactor (source helpers and uniforms)

What was done
- Centralized source selection and uniform setup in `main.js` with helpers: `getFitModeVal`, `getActiveSourceDims`, `bindActiveTexture(unit)`, and `setSourceUniforms(loc)`.
- Updated compose and prepass code to use these helpers, reducing duplication and making future inputs simpler to add.

Why it was done
- Reduce repeated logic and make the pipeline resilient to new input types.

How it was done
- Replaced manual binds and per-call uniform calculations with shared helpers; verified uniforms `u_sourceSize`/`u_fitMode` are consistently set wherever sampling occurs.

### 2025-09-12 — Parameter schema/state store v1 and renderer-store refactor

What was done
- Introduced a parameter schema in `main.js` that defines ids, groups, types, ranges, defaults, and tooltips for existing controls (Mandala, Warping, Color, Flow, Feedback, Bloom).
- Added a central state store with validation, clamping, batched change notifications, and persistence via `localStorage` keyed by a schema version.
- Bound all UI elements to the store (UI → store on input; store → UI via subscriptions) so the renderer is decoupled from DOM controls.
- Refactored the renderer to read values from the store for all uniforms across passes (compose, feedback, flow, bloom chain), eliminating direct DOM reads.
- Standardized a pass graph declaration and retained cached uniform locations per pass in `loc.*`.
- Updated presets to write into the store; UI syncs automatically.

Why it was done
- Establish a single source of truth for parameters, enabling consistent validation, migration, and persistence.
- Decouple UI from GL rendering to simplify future features (presets, modulators/LFOs, keyframes) and reduce uniform churn bugs.
- Aligns with planned preset/animation systems and improves testability and maintainability.

How it was done
- Added `parameterSchema` (typed entries with ranges and defaults) and a `createStateStore` helper providing `get/set/setMany/subscribe` with coercion and clamping.
- Initialized the store from persisted data when present, otherwise from schema defaults; versioned under `shader_params_v1`.
- Implemented `bindUIToStore()` and `reflectStoreToUI()` so UI stays in sync with programmatic changes (e.g., presets) and user edits persist across reloads.
- Replaced all `parseFloat(...)`/`checked` reads inside draw functions with `store.get(id)` equivalents; bloom subpasses now also read from the store.
- Preset application now calls `store.setMany(...)` instead of mutating DOM; rendering reflects changes next frame.

Basis
- Centralized state and schema-driven validation are standard practice for complex UIs and real-time systems; they support migrations and eliminate divergent state between UI and renderer.
- This change satisfies the near-term acceptance criteria: schema covers diverse params; values clamp/validate; state persists/restores; renderer reads from the store; uniform locations remain cached per pass; visual output matches prior behavior.

### 2025-09-12 — Global transport (play/pause, BPM) and BPM uniform

What was done
- Added Play/Pause button and BPM numeric input to the header in `index.html`.
- Extended the parameter schema with `bpm` (20–300, default 120) and bound it to the store and header.
- Implemented a global transport clock (play/pause) providing `timeSeconds()` and beat phase; renderer time now comes from this clock.
- Introduced `u_bpm` uniform to compose and flow passes and set it each frame; guarded uniform sets when optimized out.

Why it was done
- Establish a stable, controllable clock for future modulators/LFOs and keyframe timing, and prepare for BPM-synced animations.

How it was done
- Added `transport` in `main.js` to track running state and compute elapsed time; wired Play/Pause button to toggle.
- `u_time` uniforms are sourced from `transport.timeSeconds()`; `u_bpm` is set from the store.
- Declared `u_bpm` in `shader.frag` and `shader_flow.frag`; updated uniform locations and per-pass sets conditionally.

Basis
- A global transport decouples animation timing from wall-clock and allows musical synchronization, which will be leveraged by modulators and the timeline.

### 2025-09-12 — Preset manager (CRUD, startup preset)

What was done
- Added preset CRUD UI: name field, Save, Update, Delete, and Set as startup.
- Implemented a preset manager that stores user presets in `localStorage` (`shader_presets_v1`) alongside built-ins.
- Dropdown now lists both built-in and user presets; apply writes into the central store.
- Startup preset is loaded on boot if set.

Why it was done
- Enables creating and managing custom looks, restoring them across sessions, and booting straight into a preferred state.

How it was done
- User presets are stored as shallow copies of the current store snapshot and merged on apply.
- Dropdown is rebuilt from the union of built-in and user preset names.
- Added safeguards: cannot overwrite or delete built-ins.

Basis
- Local, lightweight preset management is sufficient for this app and lays the groundwork for export/import and shareable URLs next.


### Follow-up: Effect toggles and 0-segment kaleidoscope

### 2025-09-12 — Multi-pass pipeline with feedback

### 2025-09-12 — Image-aware flow field and prepass

### 2025-09-12 — Bloom/glow and pipeline polish

### 2025-09-12 — Flow-chroma, kaleidoscope mask, and presets

What was done
- Added flow-driven chromatic aberration in the compose pass with toggle and amount control.
- Introduced radial mask for the kaleidoscope so symmetry applies outside a controllable inner radius and blends into an outer radius.
- Added a simple presets selector to quickly set parameters for "Mandala Tunnel", "Liquid Flow", and "Soft Bloom" looks.

Why it was done
- The video reference shows color separation that follows motion and symmetry that often spares the focal center. Presets help iterate faster during live tweaking.

How it was done
- New uniforms in `shader.frag`: `u_enableChromaFlow`, `u_chromaAmt`, `u_kInner`, `u_kOuter`.
- Mask formula: `mask = smoothstep(u_kInner, u_kOuter, length(p))`; `p` is blended with its kaleidoscoped version by this mask.
- Chroma: offsets RGB along a flow-inspired direction: `du = flowDir * off` where `flowDir` is derived from the same low-cost curl-like domain warp used in compose; amount scaled by `u_chromaAmt`.
- UI additions in `index.html`; wiring in `main.js` passes the new uniforms each frame.
- Presets update related UI values and rely on the existing uniform wiring; no shader rebuild required.

Basis
- Flow-locked chromatic offsets mirror motion-linked color fringing present in many psychedelic visuals. Radial kaleidoscope masking preserves a readable focal region (center of the photo) while pushing symmetry to the periphery, closer to the video’s staged composition.

What was done
- Added bright-pass threshold, separable blur (H/V), and bloom combine passes.
- Hooked UI for enable/threshold/radius/intensity; bloom applied after feedback accumulation.
- Fixed framebuffer feedback loop by separating compose target from accumulation buffers and swapping per frame.

Why it was done
- To reproduce the subtle glow/halation and amplified brights found in the reference video while keeping cost low.

How it was done
- New shaders: `shader_threshold.frag`, `shader_blurH.frag`, `shader_blurV.frag`, `shader_bloom.frag`. `main.js` orchestrates threshold->blurH->blurV->combine.

What was done
- Added `shader_prepass.frag` to compute luminance, Sobel edge magnitude, and gradient direction.
- Added `shader_flow.frag` to combine tangent-to-edge vectors with curl noise into a flow field.
- Wired new FBOs (`analysisFBO`, `flowFBO`) and UI controls (flow mix, advect strength, curl scale/speed, enable toggle).
- Extended `shader_feedback.frag` to advect previous frame UVs with flow and blend via decay.

Why it was done
- Make motion follow real structures in the image (bricks, rails) while remaining fluid via curl noise, matching the reference video's organic flow.

How it was done
- Prepass packs luminance/edge/gradient in RGBA. Flow pass reads it and synthesizes a vector field. Feedback pass backtraces along this field and mixes with current compose result.

What was done
- Introduced ping-pong FBO pipeline and new passes: `shader_feedback.frag` and `shader_blit.frag`.
- Refactored `main.js` to compose into an offscreen target, then mix with previous frame using decay + micro zoom/rotate, then blit to screen.
- Added UI controls for feedback enable, decay, zoom rate, rotate rate, and a reset button.

Why it was done
- To match the video's tunnel/echo quality with persistent trails and subtle movement.

How it was done
- Two framebuffers (`fboA`, `fboB`) swap roles each frame. The composed image is fed into a feedback shader that samples the previous frame with slight transform and blends via `u_decay`.

What was done
- Added UI checkboxes to toggle kaleidoscope, warping, and color cycling.
- Allowed `segments=0` to disable kaleidoscope cleanly.
- Introduced uniforms `u_enableKaleido`, `u_enableWarp`, `u_enableColor` and guarded logic in `shader.frag`.

Why it was done
- Requested control to disable splits and selectively enable effects per image.

How it was done
- Updated `index.html` to include checkboxes and extended ranges (segments min=0).
- `main.js` now sends boolean uniforms each frame; shader applies kaleidoscope only when enabled and segments>0, and wraps warping/color logic behind toggles.

What was done
- Created a local ShaderToy-style viewer with `index.html`, `main.js`, `shader.vert`, `shader.frag`.
- Implemented kaleidoscopic mandala shader: segment symmetry, fbm warping, cosine/HSV color cycling, optional texture mixing.
- Added drag-and-drop or file-pick image upload, PNG frame capture, and interactive controls (segments, rotation, zoom, warp, flow, color speed, texture mix).
- Started a local static server on port 5500 for testing.

Basis
- ShaderToy restricts custom texture uploads; a local viewer enables using any image with live controls for psychedelic experiments.
- The kaleidoscope+warp+color approach synthesizes techniques discussed (polar repetition, fBM domain warping, multi-frequency color oscillation).

### 2025-09-13 — Multi-scale optical flow, temporal smoothing, and auto-gain

What was done
- Added pyramidal optical flow (half-resolution) with adjustable blend between coarse and fine flow.
- Introduced temporal smoothing (EMA) of the flow field to reduce jitter.
- Implemented auto-gain in feedback advection to normalize by flow magnitude and prevent spikes.

Why it was done
- Multi-scale flow improves tracking of larger motions and increases stability; temporal smoothing reduces small-motion flicker; auto-gain keeps advection visually consistent across clips.

How it was done
- New shaders: `shader_downsample.frag` (luma downsample), `shader_flow_add.frag` (flow blend), and reuse of `shader_flow_combine.frag`.
- New FBOs: half-res luma (prev/current) and half-res flow; pipeline downsamples, computes half-res flow, renders synthetic fine flow, and blends with upsampled coarse flow into `flowFBO`.
- Smoothing: combined previous frame signal into `flowFBO` each frame using EMA.
- Auto-gain: added `u_enableAutoGain` to `shader_feedback.frag` and normalized sampled flow vectors before applying `u_advectStrength`.

Basis
- Pyramidal Lucas–Kanade is the standard for large motions; EMA smoothing is a common post-process for vector fields; auto-gain stabilizes visual intensity.


