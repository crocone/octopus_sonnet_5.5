import * as THREE from 'three';

/* ======================================================================
   THE JAR ESCAPE — an octopus unscrews the lid from the inside.
   Everything is procedural: geometry, skin, wood, metal, glass, caustics.
   ====================================================================== */

const { Vector3: V3, Quaternion: Q, Matrix4: M4, Color: C } = THREE;
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const dampTo = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

function mulberry(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry(20240611);

/* ---------- tileable value noise (used for the wood) ---------- */
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function tnoise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const X0 = ((x0 % px) + px) % px, X1 = (X0 + 1) % px;
  const Y0 = ((y0 % py) + py) % py, Y1 = (Y0 + 1) % py;
  const a = hash2(X0, Y0, seed), b = hash2(X1, Y0, seed), c = hash2(X0, Y1, seed), d = hash2(X1, Y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/* ---------- error surface ---------- */
function showError(msg) {
  const e = $('err');
  e.style.display = 'block';
  e.textContent = msg;
  const l = $('loading'); if (l) l.style.display = 'none';
}
window.addEventListener('error', ev => showError('Something went wrong: ' + (ev.message || ev.error)));
window.addEventListener('unhandledrejection', ev => showError('Something went wrong: ' + (ev.reason && ev.reason.message || ev.reason)));

/* ---------- world constants (1 unit ≈ 34 mm) ---------- */
const MM = 34;
const LAMP = new V3(-6.6, 5.4, 3.4);
const JAR = {
  R: 1.25, Rin: 1.18, floor: 0.12,
  neckR: 0.715, neckIn: 0.595, rim: 3.43,
  sh0: 2.40, sh1: 3.02,
  water: 3.39,
};
const LID = { Y0: 3.15, pitch: 0.075, Hfree: 0.27, R: 0.80, H: 0.30, under: 0.25, turns: 0.27 / 0.075 };

/* ---------- renderer ---------- */
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
} catch (e) {
  showError('WebGL is not available in this browser, so the scene cannot be drawn.');
  throw e;
}
let PR = Math.min(window.devicePixelRatio || 1, 1.5);
const quality = { scale: 1 };
renderer.setPixelRatio(PR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.background = new C(0x05070a);
scene.fog = new THREE.FogExp2(0x070a0c, 0.022);

const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 90);

/* ---------- shared shader uniforms ---------- */
const U = {
  time: { value: 0 },
  lamp: { value: LAMP },
  jar: { value: new THREE.Vector4(JAR.R, 3.45, 0, 0) },
  focus: { value: 2.6 },
  refr: { value: null },
  env: { value: null },
  res: { value: new THREE.Vector2(1, 1) },
  viewProj: { value: new M4() },
  camPos: { value: new V3() },
  thud: { value: 0 },
};

/* ---------- orbit camera (drag to orbit, wheel / pinch to zoom) ---------- */
const orbit = {
  target: new V3(0.35, 1.7, 0), tTarget: new V3(0.35, 1.7, 0),
  az: -0.3, pol: 1.36, dist: 13.4,
  tAz: -0.3, tPol: 1.36, tDist: 13.4,
  shake: 0,
};
const pointers = new Map();
let pinchBase = 0, pinchDist0 = 0;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.classList.add('drag');
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchBase = Math.hypot(a.x - b.x, a.y - b.y);
    pinchDist0 = orbit.tDist;
  }
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    orbit.tAz -= dx * 0.0055;
    orbit.tPol = clamp(orbit.tPol - dy * 0.0055, 0.3, 1.72);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchBase > 1) orbit.tDist = clamp(pinchDist0 * pinchBase / d, 5.5, 26);
  }
});
const endPointer = e => {
  pointers.delete(e.pointerId);
  if (!pointers.size) canvas.classList.remove('drag');
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  orbit.tDist = clamp(orbit.tDist * Math.exp(e.deltaY * 0.0011), 5.5, 26);
}, { passive: false });

function updateCamera(dt) {
  const k = 1 - Math.exp(-9 * dt);
  orbit.az += (orbit.tAz - orbit.az) * k;
  orbit.pol += (orbit.tPol - orbit.pol) * k;
  orbit.dist += (orbit.tDist - orbit.dist) * k;
  orbit.target.lerp(orbit.tTarget, 1 - Math.exp(-2.2 * dt));
  const sp = Math.sin(orbit.pol);
  camera.position.set(
    orbit.target.x + orbit.dist * sp * Math.sin(orbit.az),
    orbit.target.y + orbit.dist * Math.cos(orbit.pol),
    orbit.target.z + orbit.dist * sp * Math.cos(orbit.az));
  if (camera.position.y < 0.35) camera.position.y = 0.35;
  if (orbit.shake > 0.0005) {
    camera.position.y += Math.sin(performance.now() * 0.09) * orbit.shake;
    camera.position.x += Math.cos(performance.now() * 0.071) * orbit.shake * 0.6;
    orbit.shake *= Math.exp(-7 * dt);
  }
  camera.lookAt(orbit.target);
  camera.updateMatrixWorld();
  U.camPos.value.copy(camera.position);
}

/* ---------- refraction render target (scene without glass/water) ---------- */
let rt = null;
function resize() {
  const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
  PR = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(3.4e6 / (w * h))) * quality.scale;
  renderer.setPixelRatio(PR);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the whole action in frame on narrow screens
  camera.fov = w / h < 1.1 ? 31 * Math.min(1.9, 1.1 / (w / h)) : 31;
  camera.updateProjectionMatrix();
  const pw = Math.floor(w * PR), ph = Math.floor(h * PR);
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(pw, ph, {
      type: THREE.HalfFloatType, samples: 2, depthBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    U.refr.value = rt.texture;
  } else rt.setSize(pw, ph);
  U.res.value.set(pw, ph);
}
window.addEventListener('resize', resize);
resize();
