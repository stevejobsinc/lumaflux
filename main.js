/* eslint-disable no-console */
(function(){
  const canvas = document.getElementById('glcanvas');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
  if(!gl){ alert('WebGL2 not supported'); return; }

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(gl.canvas.clientWidth * dpr);
    const h = Math.floor(gl.canvas.clientHeight * dpr);
    if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; gl.viewport(0,0,w,h); recreateFBOs(); }
  }
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  async function loadText(url){ const res = await fetch(url); return await res.text(); }
  function compile(type, src){ const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){ throw new Error(gl.getShaderInfoLog(sh)); } return sh; }
  function link(vs, fs){ const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, 'a_position'); gl.linkProgram(p); if(!gl.getProgramParameter(p, gl.LINK_STATUS)){ throw new Error(gl.getProgramInfoLog(p)); } return p; }

  // Fullscreen triangle
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  gl.bindVertexArray(null);

  // UI
  const ui = {
    drop: document.getElementById('drop'), file: document.getElementById('file'), clearTex: document.getElementById('clearTex'), texInfo: document.getElementById('texInfo'),
    enableKaleido: document.getElementById('enableKaleido'), segments: document.getElementById('segments'), segmentsLabel: document.getElementById('segmentsLabel'), rotate: document.getElementById('rotate'), zoom: document.getElementById('zoom'),
    enableWarp: document.getElementById('enableWarp'), warp: document.getElementById('warp'), flow: document.getElementById('flow'),
    enableColor: document.getElementById('enableColor'), colorSpeed: document.getElementById('colorSpeed'), texMix: document.getElementById('texMix'),
    saveFrame: document.getElementById('saveFrame'),
    // Flow field controls
    enableFlowAdvect: document.getElementById('enableFlowAdvect'), flowMix: document.getElementById('flowMix'), advectStrength: document.getElementById('advectStrength'), curlScale: document.getElementById('curlScale'), curlSpeed: document.getElementById('curlSpeed'),
    // Feedback controls
    enableFeedback: document.getElementById('enableFeedback'), decay: document.getElementById('decay'), zoomRate: document.getElementById('zoomRate'), rotateRate: document.getElementById('rotateRate'), resetFeedback: document.getElementById('resetFeedback'),
    // Chroma & kaleido mask
    enableChromaFlow: document.getElementById('enableChromaFlow'), chromaAmt: document.getElementById('chromaAmt'), kInner: document.getElementById('kInner'), kOuter: document.getElementById('kOuter'),
    // Presets
    preset: document.getElementById('preset'), applyPreset: document.getElementById('applyPreset'),
    presetName: document.getElementById('presetName'), savePreset: document.getElementById('savePreset'), updatePreset: document.getElementById('updatePreset'), deletePreset: document.getElementById('deletePreset'), setStartupPreset: document.getElementById('setStartupPreset'),
    exportPreset: document.getElementById('exportPreset'), importPreset: document.getElementById('importPreset'), sharePreset: document.getElementById('sharePreset'), importFile: document.getElementById('importFile'),
    // Transport
    playPause: document.getElementById('playPause'), bpm: document.getElementById('bpm'),
    // Video
    loadVideoBtn: document.getElementById('loadVideoBtn'), videoFile: document.getElementById('videoFile'), useWebcam: document.getElementById('useWebcam'), videoInfo: document.getElementById('videoInfo'),
    fitMode: document.getElementById('fitMode'), videoPlayPause: document.getElementById('videoPlayPause'), videoMuted: document.getElementById('videoMuted'), videoLoop: document.getElementById('videoLoop'), videoSeek: document.getElementById('videoSeek'),
    status: document.getElementById('status'),
  };

  // Parameter schema and central state store (v1)
  const SCHEMA_VERSION = 1;
  const PARAM_STORAGE_KEY = 'shader_params_v1';

  /**
   * Parameter definitions. Ids match DOM element ids where applicable.
   * type: 'float' | 'int' | 'bool'
   */
  const parameterSchema = [
    // Mandala
    { id: 'enableKaleido', label: 'Enable kaleidoscope', group: 'Mandala', type: 'bool', default: true, tooltip: 'Toggle kaleidoscopic mapping.' },
    { id: 'segments', label: 'Segments', group: 'Mandala', type: 'int', min: 0, max: 24, step: 1, default: 8, tooltip: 'Number of kaleidoscope segments.' },
    { id: 'rotate', label: 'Rotate', group: 'Mandala', type: 'float', min: 0, max: 6.283, step: 0.001, default: 0.0, tooltip: 'Rotation in radians.' },
    { id: 'zoom', label: 'Zoom', group: 'Mandala', type: 'float', min: 0.25, max: 3, step: 0.01, default: 1.0, tooltip: 'Screen-space zoom.' },
    { id: 'kInner', label: 'Mask inner radius', group: 'Mandala', type: 'float', min: 0, max: 1.2, step: 0.001, default: 0.15, tooltip: 'Inner radius of kaleido blend mask.' },
    { id: 'kOuter', label: 'Mask outer radius', group: 'Mandala', type: 'float', min: 0, max: 1.5, step: 0.001, default: 0.85, tooltip: 'Outer radius of kaleido blend mask.' },
    // MirrorGrid tiling (pre-kaleido)
    { id: 'enableTile', label: 'Enable tiling', group: 'Mandala', type: 'bool', default: false, tooltip: 'Mirror tiling before kaleidoscope.' },
    { id: 'tileX', label: 'Tile X', group: 'Mandala', type: 'int', min: 1, max: 8, step: 1, default: 2, tooltip: 'Horizontal tiles.' },
    { id: 'tileY', label: 'Tile Y', group: 'Mandala', type: 'int', min: 1, max: 8, step: 1, default: 2, tooltip: 'Vertical tiles.' },
    { id: 'tileMirror', label: 'Tile mirror', group: 'Mandala', type: 'bool', default: true, tooltip: 'Alternate cell mirroring.' },

    // Warping / Color
    { id: 'enableWarp', label: 'Enable warping', group: 'Warping', type: 'bool', default: true, tooltip: 'Toggle domain warp.' },
    { id: 'warp', label: 'Warp strength', group: 'Warping', type: 'float', min: 0, max: 1, step: 0.001, default: 0.3, tooltip: 'Strength of warp.' },
    { id: 'flow', label: 'Flow speed', group: 'Warping', type: 'float', min: 0, max: 3, step: 0.01, default: 1.0, tooltip: 'Flow speed scalar.' },
    { id: 'enableColor', label: 'Enable color cycling', group: 'Color', type: 'bool', default: true, tooltip: 'Toggle hue cycling.' },
    { id: 'colorSpeed', label: 'Color speed', group: 'Color', type: 'float', min: 0, max: 3, step: 0.01, default: 0.8, tooltip: 'Hue cycling speed.' },
    { id: 'texMix', label: 'Texture mix', group: 'Color', type: 'float', min: 0, max: 1, step: 0.01, default: 0.7, tooltip: 'Mix factor for texture vs base.' },
    { id: 'enableChromaFlow', label: 'Flow-based chroma', group: 'Color', type: 'bool', default: true, tooltip: 'Toggle chromatic offset based on flow.' },
    { id: 'chromaAmt', label: 'Chroma amount', group: 'Color', type: 'float', min: 0, max: 4, step: 0.01, default: 1.2, tooltip: 'Chromatic aberration amount.' },

    // Flow Field
    { id: 'enableFlowAdvect', label: 'Enable flow advection', group: 'Flow', type: 'bool', default: true, tooltip: 'Use flow field to advect feedback.' },
    { id: 'flowMix', label: 'Flow mix', group: 'Flow', type: 'float', min: 0, max: 1, step: 0.01, default: 0.6, tooltip: 'Balance edges vs curl.' },
    { id: 'advectStrength', label: 'Advect strength', group: 'Flow', type: 'float', min: 0, max: 6, step: 0.01, default: 0.5, tooltip: 'Feedback advection strength (pixels/frame).' },
    { id: 'curlScale', label: 'Curl scale', group: 'Flow', type: 'float', min: 0.5, max: 8, step: 0.1, default: 2.5, tooltip: 'Curl field scale.' },
    { id: 'curlSpeed', label: 'Curl speed', group: 'Flow', type: 'float', min: 0, max: 3, step: 0.01, default: 1.0, tooltip: 'Curl field time scale.' },
    { id: 'enableOpticalFlow', label: 'Enable optical flow', group: 'Flow', type: 'bool', default: false, tooltip: 'Use Lucas–Kanade optical flow (prev/current luminance).' },
    { id: 'optFlowScale', label: 'Optical flow scale', group: 'Flow', type: 'float', min: 0, max: 20, step: 0.01, default: 6.0, tooltip: 'Scale factor for optical flow vectors.' },
    { id: 'optFlowRadius', label: 'Optical flow window', group: 'Flow', type: 'int', min: 1, max: 3, step: 1, default: 2, tooltip: 'Window radius (1=3x3 .. 3=7x7).'},
    { id: 'enablePyramidalFlow', label: 'Pyramidal flow', group: 'Flow', type: 'bool', default: true, tooltip: 'Multi-scale (half-res) optical flow.' },
    { id: 'pyrLargeWeight', label: 'Pyramid large weight', group: 'Flow', type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, tooltip: 'Blend of coarse vs fine flow.' },
    { id: 'flowSmoothing', label: 'Flow temporal smoothing', group: 'Flow', type: 'float', min: 0, max: 0.99, step: 0.01, default: 0.6, tooltip: 'EMA smoothing for flow field.' },
    { id: 'enableAutoGain', label: 'Auto-gain advection', group: 'Flow', type: 'bool', default: true, tooltip: 'Normalize advection by flow magnitude.' },

    // Feedback
    { id: 'enableFeedback', label: 'Enable feedback tunnel', group: 'Feedback', type: 'bool', default: true, tooltip: 'Toggle feedback blend.' },
    { id: 'decay', label: 'Decay', group: 'Feedback', type: 'float', min: 0.80, max: 0.999, step: 0.001, default: 0.965, tooltip: 'Feedback decay factor.' },
    { id: 'zoomRate', label: 'Zoom rate', group: 'Feedback', type: 'float', min: 0.0, max: 0.02, step: 0.0005, default: 0.004, tooltip: 'Feedback zoom per frame.' },
    { id: 'rotateRate', label: 'Rotate rate', group: 'Feedback', type: 'float', min: -0.02, max: 0.02, step: 0.0005, default: 0.002, tooltip: 'Feedback rotation per frame.' },
    // Spiral Tunnel + Orbital Echoes
    { id: 'enablePolarFeedback', label: 'Log-polar feedback', group: 'Feedback', type: 'bool', default: true, tooltip: 'Tunnel-style replication.' },
    { id: 'polarScale', label: 'Polar scale', group: 'Feedback', type: 'float', min: 0.5, max: 4, step: 0.01, default: 1.2, tooltip: 'Log radius scale.' },
    { id: 'polarTwist', label: 'Polar twist', group: 'Feedback', type: 'float', min: -2, max: 2, step: 0.001, default: 0.3, tooltip: 'Twist across radius.' },
    { id: 'echoTaps', label: 'Echo taps', group: 'Feedback', type: 'int', min: 0, max: 3, step: 1, default: 2, tooltip: 'Extra rotated prev samples.' },
    { id: 'echoMix', label: 'Echo mix', group: 'Feedback', type: 'float', min: 0, max: 1, step: 0.01, default: 0.35, tooltip: 'Blend of echo taps.' },
    { id: 'echoAngle', label: 'Echo angle', group: 'Feedback', type: 'float', min: 0, max: 1.5707, step: 0.001, default: 0.25, tooltip: 'Rotation between taps (rad).' },

    // Bloom
    { id: 'enableBloom', label: 'Enable bloom', group: 'Bloom', type: 'bool', default: true, tooltip: 'Toggle bloom pass.' },
    { id: 'bloomThreshold', label: 'Threshold', group: 'Bloom', type: 'float', min: 0, max: 1, step: 0.01, default: 0.6, tooltip: 'Bright pass threshold.' },
    { id: 'bloomIntensity', label: 'Intensity', group: 'Bloom', type: 'float', min: 0, max: 3, step: 0.01, default: 0.8, tooltip: 'Bloom blend intensity.' },
    { id: 'bloomRadius', label: 'Radius', group: 'Bloom', type: 'float', min: 0.5, max: 3, step: 0.05, default: 1.2, tooltip: 'Blur radius scale.' },
    // Transport
    { id: 'bpm', label: 'Beats per minute', group: 'Transport', type: 'float', min: 20, max: 300, step: 0.1, default: 120.0, tooltip: 'Global tempo for sync.' },
  ];

  function createStateStore(schema, opts){
    const storageKey = opts.storageKey;
    const schemaVersion = opts.schemaVersion;
    const schemaMap = new Map(schema.map(def => [def.id, def]));

    function coerceValue(def, value){
      if(def.type === 'bool') return !!value;
      if(def.type === 'int'){
        const n = Math.round(Number(value));
        const min = def.min ?? Number.NEGATIVE_INFINITY;
        const max = def.max ?? Number.POSITIVE_INFINITY;
        return Math.min(max, Math.max(min, isFinite(n) ? n : def.default));
      }
      // float
      const f = Number(value);
      const min = def.min ?? Number.NEGATIVE_INFINITY;
      const max = def.max ?? Number.POSITIVE_INFINITY;
      const val = isFinite(f) ? f : def.default;
      return Math.min(max, Math.max(min, val));
    }

    function defaultValues(){
      const out = {};
      for(const def of schema){ out[def.id] = coerceValue(def, def.default); }
      return out;
    }

    function load(){
      try{
        const raw = localStorage.getItem(storageKey);
        if(!raw) return { version: schemaVersion, values: defaultValues() };
        const data = JSON.parse(raw);
        if(data.version !== schemaVersion) return { version: schemaVersion, values: defaultValues() };
        const values = defaultValues();
        for(const [key, val] of Object.entries(data.values || {})){
          const def = schemaMap.get(key); if(!def) continue;
          values[key] = coerceValue(def, val);
        }
        return { version: schemaVersion, values };
      }catch{ return { version: schemaVersion, values: defaultValues() }; }
    }

    let { values } = load();
    const listeners = new Set();

    function persist(){
      try{ localStorage.setItem(storageKey, JSON.stringify({ version: schemaVersion, values })); }catch{}
    }

    function set(id, newValue){
      const def = schemaMap.get(id); if(!def) return false;
      const coerced = coerceValue(def, newValue);
      if(values[id] === coerced) return false;
      values[id] = coerced; persist();
      for(const fn of listeners){ try{ fn({ [id]: coerced }); }catch{} }
      return true;
    }

    function setMany(partial){
      let changed = false; const changedMap = {};
      for(const [id, v] of Object.entries(partial)){
        const def = schemaMap.get(id); if(!def) continue;
        const coerced = coerceValue(def, v);
        if(values[id] !== coerced){ values[id] = coerced; changed = true; changedMap[id] = coerced; }
      }
      if(changed){ persist(); for(const fn of listeners){ try{ fn(changedMap); }catch{} } }
      return changed;
    }

    function get(id){ return values[id]; }
    function getAll(){ return { ...values }; }
    function subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); }

    return { get, getAll, set, setMany, subscribe, schemaMap };
  }

  const store = createStateStore(parameterSchema, { storageKey: PARAM_STORAGE_KEY, schemaVersion: SCHEMA_VERSION });

  // Reflect store → UI and UI → store
  const paramIds = new Set(parameterSchema.map(p => p.id));
  function reflectStoreToUI(){
    const vals = store.getAll();
    for(const id of paramIds){
      const el = document.getElementById(id); if(!el) continue;
      const v = vals[id];
      if(el.type === 'checkbox'){ el.checked = !!v; }
      else { el.value = String(v); }
      if(id === 'segments' && ui.segmentsLabel){ ui.segmentsLabel.textContent = String(v); }
    }
  }

  function bindUIToStore(){
    for(const def of parameterSchema){
      const el = document.getElementById(def.id); if(!el) continue;
      // Initialize UI from store
      if(el.type === 'checkbox'){ el.checked = !!store.get(def.id); }
      else { el.value = String(store.get(def.id)); }
      if(def.id === 'segments' && ui.segmentsLabel){ ui.segmentsLabel.textContent = String(store.get(def.id)); }
      // Wire change listeners
      const handler = ()=>{
        const raw = el.type === 'checkbox' ? el.checked : el.value;
        store.set(def.id, raw);
        if(def.id === 'segments' && ui.segmentsLabel){ ui.segmentsLabel.textContent = String(store.get(def.id)); }
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    }
    // Keep UI in sync when store changes programmatically (e.g., presets)
    store.subscribe(()=>{ requestAnimationFrame(reflectStoreToUI); });
  }

  // Presets
  const PRESETS = {
    default: {
      enableKaleido: true, segments: 8, kInner: 0.15, kOuter: 0.85,
      enableFlowAdvect: true, advectStrength: 0.01, flowMix: 0.6,
      enableChromaFlow: true, chromaAmt: 1.2,
    },
    tunnel: {
      enableKaleido: true, segments: 12, kInner: 0.2, kOuter: 0.9,
      zoomRate: 0.006, rotateRate: 0.003, decay: 0.972,
      enableBloom: true, bloomIntensity: 1.1,
    },
    flow: {
      enableKaleido: false, enableFlowAdvect: true, flowMix: 0.8,
      advectStrength: 0.02, curlScale: 2.0, curlSpeed: 1.5,
      enableChromaFlow: true, chromaAmt: 1.6,
    },
    softbloom: {
      enableBloom: true, bloomThreshold: 0.5, bloomIntensity: 1.4, bloomRadius: 1.8,
      enableKaleido: false, enableFlowAdvect: false,
    },
    replicasion: {
      enableKaleido: true, segments: 12, kInner: 0.15, kOuter: 0.95,
      enableTile: true, tileX: 2, tileY: 2, tileMirror: true,
      enableFeedback: true, decay: 0.968, zoomRate: 0.0065, rotateRate: 0.0025,
      enableFlowAdvect: true, advectStrength: 0.014, flowMix: 0.7, curlScale: 2.2, curlSpeed: 1.2,
      enableChromaFlow: true, chromaAmt: 1.6,
      enableBloom: true, bloomThreshold: 0.5, bloomIntensity: 1.2, bloomRadius: 1.6,
      enablePolarFeedback: true, polarScale: 1.3, polarTwist: 0.35,
      echoTaps: 2, echoMix: 0.4, echoAngle: 0.22,
    }
  };

  function applyPresetToStore(name){
    const p = PRESETS[name] || PRESETS.default;
    store.setMany(p);
  }

  // Preset Manager (localStorage CRUD)
  const PRESET_STORAGE_KEY = 'shader_presets_v1';
  const STARTUP_PRESET_KEY = 'shader_startup_preset';
  function loadUserPresets(){
    try{ return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || '{}'); }catch{ return {}; }
  }
  function saveUserPresets(obj){ try{ localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(obj)); }catch{} }
  function listAllPresetNames(){
    const builtins = Object.keys(PRESETS);
    const user = Object.keys(loadUserPresets());
    return Array.from(new Set([...builtins, ...user]));
  }
  function getPresetByName(name){
    const user = loadUserPresets();
    return user[name] || PRESETS[name] || null;
  }
  function createPreset(name, values){
    if(!name || PRESETS[name]) return false; // cannot override built-ins here
    const user = loadUserPresets();
    user[name] = { ...values };
    saveUserPresets(user);
    return true;
  }
  function updatePreset(name, values){
    if(!name) return false;
    const user = loadUserPresets();
    if(!(name in user)) return false;
    user[name] = { ...values };
    saveUserPresets(user);
    return true;
  }
  function deletePresetByName(name){
    const user = loadUserPresets();
    if(!(name in user)) return false;
    delete user[name];
    saveUserPresets(user);
    return true;
  }
  function setStartupPreset(name){ try{ localStorage.setItem(STARTUP_PRESET_KEY, name); }catch{} }
  function getStartupPreset(){ try{ return localStorage.getItem(STARTUP_PRESET_KEY); }catch{ return null; } }

  // UI helpers
  function refreshPresetDropdown(){
    const sel = ui.preset; if(!sel) return;
    const current = sel.value;
    // Remove all children
    while(sel.firstChild){ sel.removeChild(sel.firstChild); }
    for(const name of listAllPresetNames()){
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    }
    // Restore selection if possible
    sel.value = listAllPresetNames().includes(current) ? current : 'default';
  }

  function snapshotCurrentParams(){ return store.getAll(); }

  // Global transport clock: play/pause and musical time helpers
  const transport = (function(){
    let running = true;
    let baseMs = performance.now();
    let pausedAccumMs = 0;
    function nowMs(){ return performance.now(); }
    function timeSeconds(){ return (running ? (nowMs() - baseMs) : pausedAccumMs) / 1000; }
    function setRunning(flag){
      if(flag === running) return;
      if(flag){
        baseMs = nowMs() - pausedAccumMs;
      } else {
        pausedAccumMs = nowMs() - baseMs;
      }
      running = flag;
    }
    function toggle(){ setRunning(!running); }
    function isRunning(){ return running; }
    function beatPhase(){ const bpm = store.get('bpm'); const bps = bpm/60; return timeSeconds() * bps; }
    return { timeSeconds, toggle, isRunning, beatPhase };
  })();

  let texture = null; let hasTexture = false; let needClear=true; let needRebuildAnalysis=true;
  let videoTexture = null; let hasVideo = false; let usingWebcam = false; let lastVideoTime = -1;
  const videoEl = document.getElementById('video');
  let sourceWidth = 0, sourceHeight = 0; let imageWidth = 0, imageHeight = 0;
  let useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  let rvfcHandle = null;

  function showStatus(msg, timeoutMs){
    if(!ui.status) return;
    ui.status.textContent = String(msg);
    ui.status.classList.remove('hidden');
    if(timeoutMs){ setTimeout(()=>{ if(ui.status){ ui.status.classList.add('hidden'); } }, timeoutMs); }
  }
  function hideStatus(){ if(ui.status) ui.status.classList.add('hidden'); }

  // Input/refactor helpers
  function getFitModeVal(){
    if(!ui.fitMode) return 0; // cover
    const v = ui.fitMode.value;
    return v === 'cover' ? 0 : v === 'contain' ? 1 : 2;
  }
  function getActiveSourceDims(){
    if(hasVideo && sourceWidth && sourceHeight) return { w: sourceWidth, h: sourceHeight };
    if(hasTexture && imageWidth && imageHeight) return { w: imageWidth, h: imageHeight };
    return { w: 0, h: 0 };
  }
  function bindActiveTexture(unit){
    gl.activeTexture(gl.TEXTURE0 + unit);
    if(hasVideo && videoTexture){ gl.bindTexture(gl.TEXTURE_2D, videoTexture); }
    else if(hasTexture && texture){ gl.bindTexture(gl.TEXTURE_2D, texture); }
  }
  function setSourceUniforms(target){
    const d = getActiveSourceDims();
    if(target.sourceSize) gl.uniform2f(target.sourceSize, d.w, d.h);
    if(target.fitMode !== undefined && target.fitMode !== null) gl.uniform1i(target.fitMode, getFitModeVal());
  }

  function initVideoTexture(){
    if(!videoTexture) videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  function updateVideoTextureIfNeeded(){
    if(!hasVideo || !videoEl || videoEl.readyState < 2) return; // HAVE_CURRENT_DATA
    const t = videoEl.currentTime;
    if(t === lastVideoTime) return;
    lastVideoTime = t;
    // update source dimensions from the video element
    if(videoEl.videoWidth && videoEl.videoHeight){ sourceWidth = videoEl.videoWidth; sourceHeight = videoEl.videoHeight; }
    if(!videoTexture) initVideoTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // Upload the current video frame
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
    gl.bindTexture(gl.TEXTURE_2D, null);
    needRebuildAnalysis = true; // analysis depends on input content
  }

  function scheduleVideoUpdates(){
    if(!hasVideo || !videoEl) return;
    if(useRVFC){
      if(rvfcHandle) return; // already scheduled
      rvfcHandle = videoEl.requestVideoFrameCallback(()=>{
        rvfcHandle = null;
        updateVideoTextureIfNeeded();
        scheduleVideoUpdates();
      });
    }
  }

  async function loadVideoFromFile(file){
    try{
      const url = URL.createObjectURL(file);
      await startVideo(url);
      usingWebcam = false;
      ui.videoInfo.textContent = `${Math.round(videoEl.videoWidth)}×${Math.round(videoEl.videoHeight)} @ file`;
      showStatus('Loaded video file', 1500);
    }catch(err){ console.error(err); alert('Failed to load video.'); }
  }

  async function startVideo(src){
    if(!videoEl) return;
    stopVideo();
    videoEl.src = src;
    videoEl.muted = true; // allow autoplay
    videoEl.playsInline = true;
    await videoEl.play().catch((e)=>{ console.warn('Autoplay failed; waiting for user gesture.', e); showStatus('Click Play to start video', 2500); });
    if(videoEl.videoWidth && videoEl.videoHeight){ sourceWidth = videoEl.videoWidth; sourceHeight = videoEl.videoHeight; }
    hasVideo = true; lastVideoTime = -1; needClear = true; needRebuildAnalysis = true;
    showStatus('Video loaded', 1500);
    scheduleVideoUpdates();
  }

  function stopVideo(){
    try{ if(videoEl){ videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); } }catch(e){ console.warn('Video stop error', e); }
    if(usingWebcam && videoEl && videoEl.srcObject){ const tracks = videoEl.srcObject.getTracks(); tracks.forEach(t=>t.stop()); videoEl.srcObject = null; }
    usingWebcam = false; hasVideo = false; lastVideoTime = -1;
    if(rvfcHandle && useRVFC){ try{ videoEl.cancelVideoFrameCallback(rvfcHandle); }catch{} rvfcHandle=null; }
  }

  async function startWebcam(){
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      stopVideo();
      videoEl.srcObject = stream;
      await videoEl.play();
      usingWebcam = true; hasVideo = true; lastVideoTime = -1; needClear = true; needRebuildAnalysis = true;
      if(videoEl.videoWidth && videoEl.videoHeight){ sourceWidth = videoEl.videoWidth; sourceHeight = videoEl.videoHeight; }
      ui.videoInfo.textContent = `webcam active`;
      showStatus('Webcam active', 1500);
      scheduleVideoUpdates();
    }catch(err){ console.error(err); showStatus('Webcam error. Check permissions and HTTPS.', 3000); alert('Webcam permission or availability error.'); }
  }
  function setTextureFromImage(img){
    if(!texture) texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    hasTexture = true;
    imageWidth = img.naturalWidth || img.width || 0; imageHeight = img.naturalHeight || img.height || 0;
    ui.texInfo.textContent = `${imageWidth}×${imageHeight}`;
    needClear = true; needRebuildAnalysis = true;
  }
  function clearTexture(){ hasTexture = false; ui.texInfo.textContent = 'No texture'; needClear = true; }
  ui.drop.addEventListener('click', () => ui.file.click());
  ui.file.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if(!f) return; const img = new Image(); img.onload = () => setTextureFromImage(img); img.src = URL.createObjectURL(f); });
  ;['dragenter','dragover'].forEach(ev=>ui.drop.addEventListener(ev, e=>{e.preventDefault(); ui.drop.style.background='#151515';}));
  ;['dragleave','drop'].forEach(ev=>ui.drop.addEventListener(ev, e=>{e.preventDefault(); ui.drop.style.background='';}));
  ui.drop.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(!f) return; const img=new Image(); img.onload=()=>setTextureFromImage(img); img.src=URL.createObjectURL(f); });
  ui.clearTex.addEventListener('click', clearTexture);
  if(ui.videoInfo){ ui.videoInfo.textContent = 'No video'; }

  ui.saveFrame.addEventListener('click', ()=>{ const a=document.createElement('a'); a.download=`frame-${Date.now()}.png`; a.href=canvas.toDataURL('image/png'); a.click(); });

  const mouse = { x: 0, y: 0 };
  canvas.addEventListener('mousemove', e => { const rect = canvas.getBoundingClientRect(); mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width); mouse.y = (rect.bottom - e.clientY) * (canvas.height / rect.height); });

  // FBO helpers
  function createTextureAttachment(w,h){ const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null); gl.bindTexture(gl.TEXTURE_2D,null); return tex; }
  function createFBO(w,h){ const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); const color = createTextureAttachment(w,h); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { fb, color, w, h }; }
  function destroyFBO(f){ if(!f) return; gl.deleteTexture(f.color); gl.deleteFramebuffer(f.fb); }

  let accumA=null, accumB=null, composeFBO=null, analysisFBO=null, analysisPrevFBO=null, flowFBO=null, optFlowFBO=null;
  // Pyramid FBOs
  let analysisHalf=null, analysisPrevHalf=null, optFlowHalf=null;
  let brightFBO=null, blurHFBO=null, blurVFBO=null; // bloom chain
  function recreateFBOs(){
    // destroy
    [accumA,accumB,composeFBO,analysisFBO,analysisPrevFBO,flowFBO,optFlowFBO,analysisHalf,analysisPrevHalf,optFlowHalf,brightFBO,blurHFBO,blurVFBO].forEach(f=>{ if(f){ destroyFBO(f); }});
    if(canvas.width>0 && canvas.height>0){
      composeFBO=createFBO(canvas.width, canvas.height);
      accumA=createFBO(canvas.width, canvas.height);
      accumB=createFBO(canvas.width, canvas.height);
      analysisFBO=createFBO(canvas.width, canvas.height);
      analysisPrevFBO=createFBO(canvas.width, canvas.height);
      flowFBO=createFBO(canvas.width, canvas.height);
      optFlowFBO=createFBO(canvas.width, canvas.height);
      // half-res pyramid
      analysisHalf=createFBO(Math.max(1, canvas.width>>1), Math.max(1, canvas.height>>1));
      analysisPrevHalf=createFBO(Math.max(1, canvas.width>>1), Math.max(1, canvas.height>>1));
      optFlowHalf=createFBO(Math.max(1, canvas.width>>1), Math.max(1, canvas.height>>1));
      brightFBO=createFBO(canvas.width, canvas.height);
      blurHFBO=createFBO(canvas.width, canvas.height);
      blurVFBO=createFBO(canvas.width, canvas.height);
      needClear=true; needRebuildAnalysis=true;
    }
  }

  // Programs: compose, feedback, blit, prepass, flow, bloom and blurs
  let progCompose, progFeedback, progBlit, progPre, progFlow, progOptFlow, progFlowCombine, progDownsample, progThreshold, progBlurH, progBlurV, progBloom; let loc={};
  const PASS_GRAPH = ['pre', 'flow', 'compose', 'feedback', 'bloom', 'blit'];

  (async function init(){
    const [vsrc, composeSrc, feedbackSrc, blitSrc, preSrc, flowSrc, optFlowSrc, flowCombineSrc, downsampleSrc, thrSrc, blurHSrc, blurVSrc, bloomSrc] = await Promise.all([
      loadText('./shader.vert'),
      loadText('./shader.frag'),
      loadText('./shader_feedback.frag'),
      loadText('./shader_blit.frag'),
      loadText('./shader_prepass.frag'),
      loadText('./shader_flow.frag'),
      loadText('./shader_optflow.frag'),
      loadText('./shader_flow_combine.frag'),
      loadText('./shader_downsample.frag'),
      loadText('./shader_threshold.frag'),
      loadText('./shader_blurH.frag'),
      loadText('./shader_blurV.frag'),
      loadText('./shader_bloom.frag'),
    ]);
    const vs = compile(gl.VERTEX_SHADER, vsrc);
    progCompose = link(vs, compile(gl.FRAGMENT_SHADER, composeSrc));
    progFeedback = link(vs, compile(gl.FRAGMENT_SHADER, feedbackSrc));
    progBlit = link(vs, compile(gl.FRAGMENT_SHADER, blitSrc));
    progPre = link(vs, compile(gl.FRAGMENT_SHADER, preSrc));
    progFlow = link(vs, compile(gl.FRAGMENT_SHADER, flowSrc));
    progOptFlow = link(vs, compile(gl.FRAGMENT_SHADER, optFlowSrc));
    progFlowCombine = link(vs, compile(gl.FRAGMENT_SHADER, flowCombineSrc));
    progDownsample = link(vs, compile(gl.FRAGMENT_SHADER, downsampleSrc));
    // downsample uniforms
    gl.useProgram(progDownsample);
    loc.downsample = { tex: gl.getUniformLocation(progDownsample, 'u_tex'), resolution: gl.getUniformLocation(progDownsample, 'u_resolution'), srcResolution: gl.getUniformLocation(progDownsample, 'u_srcResolution') };
    gl.uniform1i(loc.downsample.tex, 0);
    // flow combine uniforms
    gl.useProgram(progFlowCombine);
    loc.flowCombine = { a: gl.getUniformLocation(progFlowCombine, 'u_a'), b: gl.getUniformLocation(progFlowCombine, 'u_b'), mix: gl.getUniformLocation(progFlowCombine, 'u_mix'), resolution: gl.getUniformLocation(progFlowCombine, 'u_resolution') };
    gl.uniform1i(loc.flowCombine.a, 0); gl.uniform1i(loc.flowCombine.b, 1);
    progThreshold = link(vs, compile(gl.FRAGMENT_SHADER, thrSrc));
    progBlurH = link(vs, compile(gl.FRAGMENT_SHADER, blurHSrc));
    progBlurV = link(vs, compile(gl.FRAGMENT_SHADER, blurVSrc));
    progBloom = link(vs, compile(gl.FRAGMENT_SHADER, bloomSrc));

    // compose uniforms
    gl.useProgram(progCompose);
    loc.compose = {
      resolution: gl.getUniformLocation(progCompose, 'u_resolution'), time: gl.getUniformLocation(progCompose, 'u_time'), mouse: gl.getUniformLocation(progCompose, 'u_mouse'),
      tex0: gl.getUniformLocation(progCompose, 'u_texture0'), hasTexture: gl.getUniformLocation(progCompose, 'u_hasTexture'), sourceSize: gl.getUniformLocation(progCompose, 'u_sourceSize'), fitMode: gl.getUniformLocation(progCompose, 'u_fitMode'),
      zoom: gl.getUniformLocation(progCompose, 'u_zoom'), rotate: gl.getUniformLocation(progCompose, 'u_rotate'), warp: gl.getUniformLocation(progCompose, 'u_warp'), flow: gl.getUniformLocation(progCompose, 'u_flow'), colorSpeed: gl.getUniformLocation(progCompose, 'u_colorSpeed'), texMix: gl.getUniformLocation(progCompose, 'u_texMix'), segments: gl.getUniformLocation(progCompose, 'u_segments'), enableKaleido: gl.getUniformLocation(progCompose, 'u_enableKaleido'), enableWarp: gl.getUniformLocation(progCompose, 'u_enableWarp'), enableColor: gl.getUniformLocation(progCompose, 'u_enableColor'),
      enableFlowAdvect: gl.getUniformLocation(progCompose, 'u_enableFlowAdvect'), flowMix: gl.getUniformLocation(progCompose, 'u_flowMix'), advectStrength: gl.getUniformLocation(progCompose, 'u_advectStrength'), curlScale: gl.getUniformLocation(progCompose, 'u_curlScale'), curlSpeed: gl.getUniformLocation(progCompose, 'u_curlSpeed'),
      enableChromaFlow: gl.getUniformLocation(progCompose, 'u_enableChromaFlow'), chromaAmt: gl.getUniformLocation(progCompose, 'u_chromaAmt'), kInner: gl.getUniformLocation(progCompose, 'u_kInner'), kOuter: gl.getUniformLocation(progCompose, 'u_kOuter'),
      // MirrorGrid uniforms
      enableTile: gl.getUniformLocation(progCompose, 'u_enableTile'), tileCount: gl.getUniformLocation(progCompose, 'u_tileCount'), tileMirror: gl.getUniformLocation(progCompose, 'u_tileMirror'),
      bpm: gl.getUniformLocation(progCompose, 'u_bpm'),
    };
    gl.uniform1i(loc.compose.tex0, 0);

    // feedback uniforms
    gl.useProgram(progFeedback);
    loc.feedback = {
      resolution: gl.getUniformLocation(progFeedback, 'u_resolution'), time: gl.getUniformLocation(progFeedback, 'u_time'),
      prevTex: gl.getUniformLocation(progFeedback, 'u_prev'), currentTex: gl.getUniformLocation(progFeedback, 'u_current'), flowTex: gl.getUniformLocation(progFeedback, 'u_flowTex'),
      decay: gl.getUniformLocation(progFeedback, 'u_decay'), zoomRate: gl.getUniformLocation(progFeedback, 'u_zoomRate'), rotateRate: gl.getUniformLocation(progFeedback, 'u_rotateRate'), enable: gl.getUniformLocation(progFeedback, 'u_enableFeedback'),
      advectStrength: gl.getUniformLocation(progFeedback, 'u_advectStrength'), enableAdvect: gl.getUniformLocation(progFeedback, 'u_enableAdvect'),
      // Spiral Tunnel + Echo
      enablePolar: gl.getUniformLocation(progFeedback, 'u_enablePolar'), polarScale: gl.getUniformLocation(progFeedback, 'u_polarScale'), polarTwist: gl.getUniformLocation(progFeedback, 'u_polarTwist'), echoTaps: gl.getUniformLocation(progFeedback, 'u_echoTaps'), echoMix: gl.getUniformLocation(progFeedback, 'u_echoMix'), echoAngle: gl.getUniformLocation(progFeedback, 'u_echoAngle'),
      enableAutoGain: gl.getUniformLocation(progFeedback, 'u_enableAutoGain'),
    };
    gl.uniform1i(loc.feedback.prevTex, 0); gl.uniform1i(loc.feedback.currentTex, 1); gl.uniform1i(loc.feedback.flowTex, 2);

    // blit uniforms
    gl.useProgram(progBlit);
    loc.blit = { tex: gl.getUniformLocation(progBlit, 'u_tex'), resolution: gl.getUniformLocation(progBlit, 'u_resolution') };
    gl.uniform1i(loc.blit.tex, 0);

    // prepass uniforms
    gl.useProgram(progPre);
    loc.pre = { resolution: gl.getUniformLocation(progPre, 'u_resolution'), tex: gl.getUniformLocation(progPre, 'u_texture0'), sourceSize: gl.getUniformLocation(progPre, 'u_sourceSize'), fitMode: gl.getUniformLocation(progPre, 'u_fitMode') };
    gl.uniform1i(loc.pre.tex, 0);

    // flow uniforms
    gl.useProgram(progFlow);
    loc.flow = { resolution: gl.getUniformLocation(progFlow, 'u_resolution'), time: gl.getUniformLocation(progFlow, 'u_time'), analysis: gl.getUniformLocation(progFlow, 'u_analysis'), flowMix: gl.getUniformLocation(progFlow, 'u_flowMix'), curlScale: gl.getUniformLocation(progFlow, 'u_curlScale'), curlSpeed: gl.getUniformLocation(progFlow, 'u_curlSpeed'), bpm: gl.getUniformLocation(progFlow, 'u_bpm') };
    gl.uniform1i(loc.flow.analysis, 0);

    // optical flow uniforms
    gl.useProgram(progOptFlow);
    loc.optflow = { resolution: gl.getUniformLocation(progOptFlow, 'u_resolution'), prevLuma: gl.getUniformLocation(progOptFlow, 'u_prevLuma'), currLuma: gl.getUniformLocation(progOptFlow, 'u_currLuma'), radius: gl.getUniformLocation(progOptFlow, 'u_radius'), scale: gl.getUniformLocation(progOptFlow, 'u_scale') };
    gl.uniform1i(loc.optflow.prevLuma, 0);
    gl.uniform1i(loc.optflow.currLuma, 1);

    // threshold uniforms (bright pass)
    gl.useProgram(progThreshold);
    loc.threshold = { tex: gl.getUniformLocation(progThreshold, 'u_tex'), resolution: gl.getUniformLocation(progThreshold, 'u_resolution'), threshold: gl.getUniformLocation(progThreshold, 'u_threshold') };
    gl.uniform1i(loc.threshold.tex, 0);

    // blur uniforms
    gl.useProgram(progBlurH);
    loc.blurH = { tex: gl.getUniformLocation(progBlurH, 'u_tex'), resolution: gl.getUniformLocation(progBlurH, 'u_resolution'), radius: gl.getUniformLocation(progBlurH, 'u_radius') };
    gl.uniform1i(loc.blurH.tex, 0);
    gl.useProgram(progBlurV);
    loc.blurV = { tex: gl.getUniformLocation(progBlurV, 'u_tex'), resolution: gl.getUniformLocation(progBlurV, 'u_resolution'), radius: gl.getUniformLocation(progBlurV, 'u_radius') };
    gl.uniform1i(loc.blurV.tex, 0);

    // bloom combine
    gl.useProgram(progBloom);
    loc.bloom = { scene: gl.getUniformLocation(progBloom, 'u_scene'), blur: gl.getUniformLocation(progBloom, 'u_blur'), resolution: gl.getUniformLocation(progBloom, 'u_resolution'), enable: gl.getUniformLocation(progBloom, 'u_enableBloom'), intensity: gl.getUniformLocation(progBloom, 'u_intensity') };
    gl.uniform1i(loc.bloom.scene, 0); gl.uniform1i(loc.bloom.blur, 1);

    recreateFBOs();
    let start = performance.now();

    ui.resetFeedback.addEventListener('click', ()=>{ needClear = true; });

    function drawCompose(target){
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.useProgram(progCompose); gl.bindVertexArray(vao);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform2f(loc.compose.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.compose.time, transport.timeSeconds());
      if(loc.compose.bpm) gl.uniform1f(loc.compose.bpm, store.get('bpm'));
      gl.uniform2f(loc.compose.mouse, mouse.x, mouse.y);
      gl.uniform1f(loc.compose.zoom, store.get('zoom'));
      gl.uniform1f(loc.compose.rotate, store.get('rotate'));
      gl.uniform1f(loc.compose.warp, store.get('warp'));
      gl.uniform1f(loc.compose.flow, store.get('flow'));
      gl.uniform1f(loc.compose.colorSpeed, store.get('colorSpeed'));
      gl.uniform1f(loc.compose.texMix, store.get('texMix'));
      gl.uniform1i(loc.compose.segments, store.get('segments'));
      gl.uniform1i(loc.compose.enableKaleido, store.get('enableKaleido')?1:0);
      gl.uniform1i(loc.compose.enableWarp, store.get('enableWarp')?1:0);
      gl.uniform1i(loc.compose.enableColor, store.get('enableColor')?1:0);
      gl.uniform1i(loc.compose.enableFlowAdvect, store.get('enableFlowAdvect')?1:0);
      gl.uniform1f(loc.compose.flowMix, store.get('flowMix'));
      gl.uniform1f(loc.compose.advectStrength, store.get('advectStrength'));
      gl.uniform1f(loc.compose.curlScale, store.get('curlScale'));
      gl.uniform1f(loc.compose.curlSpeed, store.get('curlSpeed'));
      gl.uniform1i(loc.compose.enableChromaFlow, store.get('enableChromaFlow')?1:0);
      gl.uniform1f(loc.compose.chromaAmt, store.get('chromaAmt'));
      gl.uniform1f(loc.compose.kInner, store.get('kInner'));
      gl.uniform1f(loc.compose.kOuter, store.get('kOuter'));
      // MirrorGrid
      if(loc.compose.enableTile) gl.uniform1i(loc.compose.enableTile, store.get('enableTile')?1:0);
      if(loc.compose.tileCount) gl.uniform2f(loc.compose.tileCount, store.get('tileX'), store.get('tileY'));
      if(loc.compose.tileMirror) gl.uniform1i(loc.compose.tileMirror, store.get('tileMirror')?1:0);
      // Prefer video when present, otherwise image texture
      bindActiveTexture(0);
      gl.uniform1i(loc.compose.hasTexture, (hasVideo && videoTexture) || (hasTexture && texture) ? 1 : 0);
      setSourceUniforms(loc.compose);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }

    function drawPrepass(){
      if(!(hasVideo || hasTexture)) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, analysisFBO.fb);
      gl.useProgram(progPre); gl.bindVertexArray(vao);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform2f(loc.pre.resolution, canvas.width, canvas.height);
      bindActiveTexture(0);
      setSourceUniforms(loc.pre);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }

    function copyAnalysisToPrev(){
      // simple blit pass using progBlit to copy analysisFBO.color → analysisPrevFBO
      gl.bindFramebuffer(gl.FRAMEBUFFER, analysisPrevFBO.fb);
      gl.useProgram(progBlit); gl.bindVertexArray(vao);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform2f(loc.blit.resolution, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisFBO.color);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }

    function drawFlow(){
      if(store.get('enableOpticalFlow')){
        // Run optical flow from previous and current luminance (analysisFBO is current luminance in R channel)
        const usePyr = store.get('enablePyramidalFlow');
        if(usePyr){
          // Downsample prev/current luminance to half-res
          gl.bindFramebuffer(gl.FRAMEBUFFER, analysisPrevHalf.fb);
          gl.useProgram(progDownsample); gl.bindVertexArray(vao);
          gl.viewport(0,0,analysisPrevHalf.w,analysisPrevHalf.h);
          gl.uniform2f(loc.downsample.resolution, analysisPrevHalf.w, analysisPrevHalf.h);
          gl.uniform2f(loc.downsample.srcResolution, canvas.width, canvas.height);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisPrevFBO.color);
          gl.drawArrays(gl.TRIANGLES,0,3);

          gl.bindFramebuffer(gl.FRAMEBUFFER, analysisHalf.fb);
          gl.viewport(0,0,analysisHalf.w,analysisHalf.h);
          gl.uniform2f(loc.downsample.resolution, analysisHalf.w, analysisHalf.h);
          gl.uniform2f(loc.downsample.srcResolution, canvas.width, canvas.height);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisFBO.color);
          gl.drawArrays(gl.TRIANGLES,0,3);

          // Optical flow at half-res
          gl.bindFramebuffer(gl.FRAMEBUFFER, optFlowHalf.fb);
          gl.useProgram(progOptFlow);
          gl.viewport(0,0,analysisHalf.w,analysisHalf.h);
          gl.uniform2f(loc.optflow.resolution, analysisHalf.w, analysisHalf.h);
          gl.uniform1i(loc.optflow.radius, store.get('optFlowRadius'));
          gl.uniform1f(loc.optflow.scale, store.get('optFlowScale'));
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisPrevHalf.color);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, analysisHalf.color);
          gl.drawArrays(gl.TRIANGLES,0,3);

          // Upsample-combine: render synthetic fine, then blend with upsampled half-res flow
          gl.bindFramebuffer(gl.FRAMEBUFFER, flowFBO.fb);
          gl.useProgram(progFlow);
          gl.viewport(0,0,canvas.width,canvas.height);
          gl.uniform2f(loc.flow.resolution, canvas.width, canvas.height);
          gl.uniform1f(loc.flow.time, transport.timeSeconds());
          if(loc.flow.bpm) gl.uniform1f(loc.flow.bpm, store.get('bpm'));
          gl.uniform1f(loc.flow.flowMix, store.get('flowMix'));
          gl.uniform1f(loc.flow.curlScale, store.get('curlScale'));
          gl.uniform1f(loc.flow.curlSpeed, store.get('curlSpeed'));
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisFBO.color);
          gl.drawArrays(gl.TRIANGLES,0,3);

          gl.useProgram(progFlowCombine);
          gl.uniform2f(loc.flowCombine.resolution, canvas.width, canvas.height);
          gl.uniform1f(loc.flowCombine.mix, store.get('pyrLargeWeight'));
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, flowFBO.color);
          // Upsample half-res flow by sampling with full-res UVs
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, optFlowHalf.color);
          gl.drawArrays(gl.TRIANGLES,0,3);
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, optFlowFBO.fb);
          gl.useProgram(progOptFlow); gl.bindVertexArray(vao);
          gl.viewport(0,0,canvas.width,canvas.height);
          gl.uniform2f(loc.optflow.resolution, canvas.width, canvas.height);
          gl.uniform1i(loc.optflow.radius, store.get('optFlowRadius'));
          gl.uniform1f(loc.optflow.scale, store.get('optFlowScale'));
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisPrevFBO.color);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, analysisFBO.color);
          gl.drawArrays(gl.TRIANGLES,0,3);
          // Render synthetic flow and then override with optical flow fully
          gl.bindFramebuffer(gl.FRAMEBUFFER, flowFBO.fb);
          gl.useProgram(progFlow);
          gl.viewport(0,0,canvas.width,canvas.height);
          gl.uniform2f(loc.flow.resolution, canvas.width, canvas.height);
          gl.uniform1f(loc.flow.time, transport.timeSeconds());
          if(loc.flow.bpm) gl.uniform1f(loc.flow.bpm, store.get('bpm'));
          gl.uniform1f(loc.flow.flowMix, store.get('flowMix'));
          gl.uniform1f(loc.flow.curlScale, store.get('curlScale'));
          gl.uniform1f(loc.flow.curlSpeed, store.get('curlSpeed'));
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisFBO.color);
          gl.drawArrays(gl.TRIANGLES,0,3);
          gl.useProgram(progFlowCombine);
          gl.uniform2f(loc.flowCombine.resolution, canvas.width, canvas.height);
          gl.uniform1f(loc.flowCombine.mix, 1.0);
          gl.activeTexture(gl.Texture0); // noop, keep slot 0
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, optFlowFBO.color);
          gl.drawArrays(gl.TRIANGLES,0,3);
        }
        // Combine synthetic flow and optical flow using flowMix as weight towards curl/edges
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, flowFBO.fb);
        gl.useProgram(progFlow); gl.bindVertexArray(vao);
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.uniform2f(loc.flow.resolution, canvas.width, canvas.height);
        gl.uniform1f(loc.flow.time, transport.timeSeconds());
        if(loc.flow.bpm) gl.uniform1f(loc.flow.bpm, store.get('bpm'));
        gl.uniform1f(loc.flow.flowMix, store.get('flowMix'));
        gl.uniform1f(loc.flow.curlScale, store.get('curlScale'));
        gl.uniform1f(loc.flow.curlSpeed, store.get('curlSpeed'));
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, analysisFBO.color);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
    }

    function drawFeedback(readFBO, currentTex, writeFBO){
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.fb);
      gl.useProgram(progFeedback); gl.bindVertexArray(vao);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform2f(loc.feedback.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.feedback.time, transport.timeSeconds());
      gl.uniform1f(loc.feedback.decay, store.get('decay'));
      gl.uniform1f(loc.feedback.zoomRate, store.get('zoomRate'));
      gl.uniform1f(loc.feedback.rotateRate, store.get('rotateRate'));
      gl.uniform1i(loc.feedback.enable, store.get('enableFeedback')?1:0);
      gl.uniform1f(loc.feedback.advectStrength, store.get('advectStrength'));
      gl.uniform1i(loc.feedback.enableAdvect, store.get('enableFlowAdvect')?1:0);
      // Spiral Tunnel + Echo + Auto-gain
      if(loc.feedback.enablePolar) gl.uniform1i(loc.feedback.enablePolar, store.get('enablePolarFeedback')?1:0);
      if(loc.feedback.polarScale) gl.uniform1f(loc.feedback.polarScale, store.get('polarScale'));
      if(loc.feedback.polarTwist) gl.uniform1f(loc.feedback.polarTwist, store.get('polarTwist'));
      if(loc.feedback.echoTaps) gl.uniform1i(loc.feedback.echoTaps, store.get('echoTaps'));
      if(loc.feedback.echoMix) gl.uniform1f(loc.feedback.echoMix, store.get('echoMix'));
      if(loc.feedback.echoAngle) gl.uniform1f(loc.feedback.echoAngle, store.get('echoAngle'));
      if(loc.feedback.enableAutoGain) gl.uniform1i(loc.feedback.enableAutoGain, store.get('enableAutoGain')?1:0);
      // bind prev, current, flow
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, readFBO.color);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, currentTex);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, flowFBO.color);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }

    function blitToScreen(tex){
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(progBlit); gl.bindVertexArray(vao);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform2f(loc.blit.resolution, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }

    // Bloom subpasses: threshold -> blurH -> blurV -> combine
    function runBloom(sceneTex){
      // threshold
      gl.bindFramebuffer(gl.FRAMEBUFFER, brightFBO.fb);
      gl.useProgram(progThreshold); gl.bindVertexArray(vao);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform2f(loc.threshold.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.threshold.threshold, store.get('bloomThreshold'));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.drawArrays(gl.TRIANGLES,0,3);

      // blur H
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurHFBO.fb);
      gl.useProgram(progBlurH);
      gl.uniform2f(loc.blurH.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.blurH.radius, store.get('bloomRadius'));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, brightFBO.color);
      gl.drawArrays(gl.TRIANGLES,0,3);

      // blur V
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurVFBO.fb);
      gl.useProgram(progBlurV);
      gl.uniform2f(loc.blurV.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.blurV.radius, store.get('bloomRadius'));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, blurHFBO.color);
      gl.drawArrays(gl.TRIANGLES,0,3);

      // combine into composeFBO to avoid reading/writing same target
      gl.bindFramebuffer(gl.FRAMEBUFFER, composeFBO.fb);
      gl.useProgram(progBloom);
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform2f(loc.bloom.resolution, canvas.width, canvas.height);
      gl.uniform1i(loc.bloom.enable, store.get('enableBloom')?1:0);
      gl.uniform1f(loc.bloom.intensity, store.get('bloomIntensity'));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blurVFBO.color);
      gl.drawArrays(gl.TRIANGLES,0,3);

      return composeFBO.color;
    }

    function clearFBO(f){ gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER,null); }

    function frame(){
      resize();
      if(!useRVFC) updateVideoTextureIfNeeded();
      if(!composeFBO||!accumA||!accumB||!analysisFBO||!flowFBO){ requestAnimationFrame(frame); return; }
      if(needClear){ clearFBO(accumA); clearFBO(accumB); needClear=false; }

      // Prepass and optical-flow staging (ensure prev is captured BEFORE recomputing current)
      const useOptFlow = store.get('enableOpticalFlow');
      if(useOptFlow){
        copyAnalysisToPrev();
        drawPrepass();
        needRebuildAnalysis = false;
      } else {
        if(needRebuildAnalysis){ drawPrepass(); needRebuildAnalysis=false; }
      }
      drawFlow();
      // Temporal smoothing of flow field (EMA): flowFBO = lerp(prevFlow, flowFBO, (1 - smoothing))
      const alpha = 1.0 - store.get('flowSmoothing');
      if(alpha < 0.999){
        // We reuse flowFBO as both source and destination via a ping using optFlowFBO as temp
        gl.bindFramebuffer(gl.FRAMEBUFFER, optFlowFBO.fb);
        gl.useProgram(progFlowCombine); gl.bindVertexArray(vao);
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.uniform2f(loc.flowCombine.resolution, canvas.width, canvas.height);
        gl.uniform1f(loc.flowCombine.mix, alpha); // mix weight towards 'b'
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, accumA.color); // use previous frame color as a stand-in buffer for history? (fallback)
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, flowFBO.color);
        gl.drawArrays(gl.TRIANGLES,0,3);
        // write back to flowFBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, flowFBO.fb);
        gl.useProgram(progBlit);
        gl.uniform2f(loc.blit.resolution, canvas.width, canvas.height);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, optFlowFBO.color);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }

      // 1) Compose current frame into composeFBO
      drawCompose(composeFBO);

      // 2) Feedback: read accumA (prev), mix with current (composeFBO.color), write into accumB
      drawFeedback(accumA, composeFBO.color, accumB);

      // 3) Optional bloom then present
      const finalTex = runBloom(accumB.color);
      blitToScreen(finalTex);

      // 4) Swap accum buffers for next frame
      const tmp = accumA; accumA = accumB; accumB = tmp;

      requestAnimationFrame(frame);
    }
    frame();

    // Presets handler → write to store and UI will sync via subscriber
    ui.applyPreset.addEventListener('click', ()=>{ applyPresetToStore(ui.preset.value); });
    ui.savePreset.addEventListener('click', ()=>{
      const name = (ui.presetName.value || '').trim();
      if(!name){ alert('Enter a preset name'); return; }
      if(PRESETS[name]){ alert('Cannot overwrite a built-in preset. Use Update instead.'); return; }
      const ok = createPreset(name, snapshotCurrentParams());
      if(!ok){ alert('Preset already exists or invalid name.'); return; }
      refreshPresetDropdown(); ui.preset.value = name; ui.presetName.value='';
    });
    ui.updatePreset.addEventListener('click', ()=>{
      const name = ui.preset.value;
      if(!name){ alert('No preset selected'); return; }
      if(PRESETS[name]){ alert('Cannot update a built-in preset. Save as a new preset.'); return; }
      const ok = updatePreset(name, snapshotCurrentParams());
      if(!ok){ alert('Preset does not exist.'); return; }
      alert('Preset updated');
    });
    ui.deletePreset.addEventListener('click', ()=>{
      const name = ui.preset.value;
      if(PRESETS[name]){ alert('Cannot delete a built-in preset.'); return; }
      if(!confirm(`Delete preset "${name}"?`)) return;
      const ok = deletePresetByName(name);
      if(ok){ refreshPresetDropdown(); ui.preset.value='default'; }
    });
    ui.setStartupPreset.addEventListener('click', ()=>{
      const name = ui.preset.value; setStartupPreset(name); alert(`Startup preset set to "${name}"`);
    });

    // Transport controls
    function updatePlayPauseLabel(){ ui.playPause.textContent = transport.isRunning() ? 'Pause' : 'Play'; }
    ui.playPause.addEventListener('click', ()=>{ transport.toggle(); updatePlayPauseLabel(); });
    // Wire BPM to store and reflect to header input
    if(ui.bpm){
      ui.bpm.value = String(store.get('bpm'));
      ui.bpm.addEventListener('input', ()=>{ store.set('bpm', ui.bpm.value); });
      store.subscribe(changed => { if('bpm' in changed) ui.bpm.value = String(changed.bpm); });
    }
    updatePlayPauseLabel();
    refreshPresetDropdown();
    const startup = getStartupPreset();
    if(startup && getPresetByName(startup)){ ui.preset.value = startup; applyPresetToStore(startup); }

    // Initialize UI-store binding now that DOM references exist
    bindUIToStore();
    reflectStoreToUI();

    // Wire video UI
    if(ui.loadVideoBtn && ui.videoFile){
      ui.loadVideoBtn.addEventListener('click', ()=> ui.videoFile.click());
      ui.videoFile.addEventListener('change', (e)=>{
        const f = e.target.files && e.target.files[0]; if(!f) return;
        loadVideoFromFile(f);
      });
    }
    if(ui.useWebcam){ ui.useWebcam.addEventListener('click', ()=> startWebcam()); }
    // Clear image texture when starting a video source to avoid ambiguity
    if(ui.loadVideoBtn){ ui.loadVideoBtn.addEventListener('click', ()=>{ if(hasTexture) clearTexture(); }); }
    if(ui.useWebcam){ ui.useWebcam.addEventListener('click', ()=>{ if(hasTexture) clearTexture(); }); }

    // Playback controls
    function updateVideoPlayPauseLabel(){ if(ui.videoPlayPause){ ui.videoPlayPause.textContent = (videoEl && !videoEl.paused) ? 'Pause' : 'Play'; } }
    if(ui.videoPlayPause){ ui.videoPlayPause.addEventListener('click', ()=>{ if(!hasVideo) return; if(videoEl.paused) videoEl.play(); else videoEl.pause(); updateVideoPlayPauseLabel(); }); }
    if(ui.videoMuted){ ui.videoMuted.addEventListener('change', ()=>{ if(videoEl) videoEl.muted = !!ui.videoMuted.checked; showStatus(videoEl.muted ? 'Muted' : 'Unmuted', 1000); }); }
    if(ui.videoLoop){ ui.videoLoop.addEventListener('change', ()=>{ if(videoEl) videoEl.loop = !!ui.videoLoop.checked; showStatus(videoEl.loop ? 'Loop on' : 'Loop off', 1000); }); }
    if(ui.videoSeek){
      ui.videoSeek.addEventListener('input', ()=>{
        if(!hasVideo || usingWebcam) return;
        const dur = videoEl.duration || 0; if(dur <= 0) return;
        const t = (Number(ui.videoSeek.value) / 1000) * dur;
        videoEl.currentTime = Math.max(0, Math.min(dur, t));
      });
    }
    if(videoEl){
      videoEl.addEventListener('loadedmetadata', ()=>{
        sourceWidth = videoEl.videoWidth; sourceHeight = videoEl.videoHeight; updateVideoPlayPauseLabel();
      });
      videoEl.addEventListener('play', updateVideoPlayPauseLabel);
      videoEl.addEventListener('pause', updateVideoPlayPauseLabel);
      videoEl.addEventListener('timeupdate', ()=>{
        if(ui.videoSeek && hasVideo && !usingWebcam){ const dur = videoEl.duration || 0; if(dur>0){ ui.videoSeek.value = String(Math.floor((videoEl.currentTime / dur) * 1000)); } }
      });
    }
  })().catch(err=>{ console.error(err); const pre=document.createElement('pre'); pre.textContent=String(err); document.body.appendChild(pre); });
})();


