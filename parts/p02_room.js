
/* ======================================================================
   ENVIRONMENT, ROOM, TABLE, LIGHTS
   ====================================================================== */

/* ---------- shared GLSL: animated water caustics ---------- */
const GLSL_CAUSTIC = /* glsl */`
float causticPattern(vec2 p, float t){
  vec2 q = mod(p * 6.28318, 6.28318) - 250.0;
  vec2 i = q; float c = 1.0; const float inten = 0.0055;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / inten), q.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

/* ---------- procedural environment cube (lamp softbox, cool window, dim room) ---------- */
let envCube, envPMREM;
function buildEnvironment() {
  const es = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(70, 40, 70),
    new THREE.MeshBasicMaterial({ color: new C().setRGB(0.010, 0.014, 0.018), side: THREE.BackSide }));
  box.position.y = 12; es.add(box);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70),
    new THREE.MeshBasicMaterial({ color: new C().setRGB(0.055, 0.03, 0.016) }));
  floor.rotation.x = -Math.PI / 2; es.add(floor);

  const panel = (w, h, pos, rgb, look = new V3(0, 1.8, 0)) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new C().setRGB(rgb[0], rgb[1], rgb[2]), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(look); es.add(m); return m;
  };
  // the warm lamp: tall soft box, the thing that paints the long highlight down the glass
  panel(2.6, 9.0, LAMP.clone().normalize().multiplyScalar(15).setY(6.0), [26, 15, 6.2]);
  panel(6, 1.6, new V3(-7, 11.5, 2), [3.2, 1.9, 0.9]);
  // cool window far right-back, teal spill
  panel(4.5, 8, new V3(11, 6.5, -9), [0.22, 0.52, 0.6]);
  panel(1.4, 6, new V3(-11, 5, -8), [0.35, 0.95, 1.05]);
  // faint warm bounce low on the camera side
  panel(10, 2, new V3(2, 0.6, 14), [0.25, 0.13, 0.06]);

  const cubeRT = new THREE.WebGLCubeRenderTarget(192, {
    type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cc = new THREE.CubeCamera(0.1, 120, cubeRT);
  cc.position.set(0, 1.8, 0);
  cc.update(renderer, es);
  envCube = cubeRT.texture;
  U.env.value = envCube;

  envPMREM = new THREE.PMREMGenerator(renderer);
  scene.environment = envPMREM.fromCubemap(envCube).texture;
  scene.environmentIntensity = 0.55;
  es.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}
buildEnvironment();

/* ---------- wood (planks, grain, butt joints) ---------- */
function makeWoodTextures() {
  const N = 1024, PLANKS = 6;
  const colC = document.createElement('canvas'); colC.width = colC.height = N;
  const nrmC = document.createElement('canvas'); nrmC.width = nrmC.height = N;
  const cx = colC.getContext('2d'), nx = nrmC.getContext('2d');
  const img = cx.createImageData(N, N);
  const d = img.data;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const pv = y / N * PLANKS, pk = Math.floor(pv), pl = pv - pk;
    const tone = hash2(pk, 3, 11), freq = 4 + hash2(pk, 5, 1) * 5, off = hash2(pk, 9, 2) * 40;
    const joint = hash2(pk, 1, 77), joint2 = (joint + 0.5) % 1;
    const knotX = hash2(pk, 12, 5), knotY = 0.25 + hash2(pk, 13, 6) * 0.5, hasKnot = hash2(pk, 14, 7) > 0.45;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const warp = tnoise(u * 4, pv * 2, 4, 12, 3) * 1.8 + tnoise(u * 2 + pk, pv * 3, 2, 18, 5) * 1.0;
      let phase = pl * freq + warp + off;
      if (hasKnot) {
        const dx = (u - knotX) * 6.0, dy = (pl - knotY) * 1.0;
        const kd = Math.hypot(dx, dy * 2.2);
        phase += 3.5 * Math.exp(-kd * kd * 6.0) / (0.25 + kd);
      }
      const ring = 0.5 + 0.5 * Math.sin(phase * TAU);
      const ringM = Math.pow(ring, 2.4);
      const fiber = tnoise(u * 6, pv * 70, 6, 420, 9);
      const fiber2 = tnoise(u * 22, pv * 240, 22, 1440, 4);
      let t = 0.46 + 0.22 * (tone - 0.5) + 0.16 * (fiber - 0.5) + 0.08 * (fiber2 - 0.5) - 0.30 * ringM;
      // plank edge gaps and butt joints
      let gap = 0;
      if (pl < 0.012 || pl > 0.990) gap = 1;
      const dj = Math.min(Math.abs(u - joint), Math.abs(u - joint2));
      if (dj < 0.0022 || dj > 0.9978) gap = 1;
      const bev = Math.min(pl, 1 - pl);
      // base colours: deep walnut → honey
      let r = 52 + 88 * t, g = 29 + 58 * t, b = 15 + 34 * t;
      const warm = 0.92 + 0.12 * tone;
      r *= warm; g *= 0.98 * warm; b *= 0.92;
      if (gap) { r = 10; g = 6; b = 4; }
      else if (bev < 0.03) { const k = 0.65 + bev / 0.03 * 0.35; r *= k; g *= k; b *= k; }
      const i = (y * N + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      hgt[y * N + x] = gap ? -1.0 : (0.35 * fiber + 0.25 * fiber2 + 0.4 * (1 - ringM) - (bev < 0.03 ? (0.03 - bev) * 14 : 0));
    }
  }
  cx.putImageData(img, 0, 0);
  // normal map from the height field
  const nimg = nx.createImageData(N, N), nd = nimg.data;
  const S = 2.6;
  for (let y = 0; y < N; y++) {
    const ym = ((y - 1 + N) % N) * N, yp = ((y + 1) % N) * N, y0 = y * N;
    for (let x = 0; x < N; x++) {
      const xm = (x - 1 + N) % N, xp = (x + 1) % N;
      const dx = (hgt[y0 + xp] - hgt[y0 + xm]) * S, dy = (hgt[yp + x] - hgt[ym + x]) * S;
      const l = 1 / Math.hypot(dx, dy, 1);
      const i = (y0 + x) * 4;
      nd[i] = (-dx * l * 0.5 + 0.5) * 255; nd[i + 1] = (dy * l * 0.5 + 0.5) * 255; nd[i + 2] = (l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
    }
  }
  nx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(colC), normalMap = new THREE.CanvasTexture(nrmC);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  return { map, normalMap };
}

/* ---------- lights ---------- */
const keyLight = new THREE.SpotLight(0xffb066, 600, 0, 0.55, 0.85, 2);
keyLight.position.copy(LAMP);
keyLight.target.position.set(0.5, 1.0, 0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 3; keyLight.shadow.camera.far = 22;
keyLight.shadow.bias = -0.00035;
keyLight.shadow.normalBias = 0.025;
scene.add(keyLight, keyLight.target);

const fill = new THREE.HemisphereLight(0x2a5868, 0x24140a, 0.65);
scene.add(fill);

/* ---------- table: wood + jar shadow + caustics, patched into the standard shader ---------- */
const wood = makeWoodTextures();
wood.map.repeat.set(3.4, 2.4); wood.normalMap.repeat.set(3.4, 2.4);
const tableMat = new THREE.MeshPhysicalMaterial({
  map: wood.map, normalMap: wood.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
  roughness: 0.62, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.42,
});
tableMat.onBeforeCompile = sh => {
  sh.uniforms.uLamp = U.lamp; sh.uniforms.uJar = U.jar; sh.uniforms.uTime = U.time; sh.uniforms.uFocus = U.focus;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform vec3 uLamp; uniform vec4 uJar; uniform float uTime; uniform float uFocus;
${GLSL_CAUSTIC}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec3 P = vWPos;
  vec3 dl = uLamp - P;
  float tmax = clamp((uJar.y - P.y) / max(dl.y, 1e-3), 0.0, 1.0);
  vec2 dxz = dl.xz;
  float tt = clamp(-dot(P.xz, dxz) / max(dot(dxz, dxz), 1e-4), 0.0, tmax);
  float dist = length(P.xz + dxz * tt);
  float R = uJar.x;
  float soft = 0.10 + 0.045 * length(P.xz);
  float sm = 1.0 - smoothstep(R * 0.93 - soft, R * 0.93 + soft, dist);
  vec2 dirT = normalize(-uLamp.xz);
  vec2 perp = vec2(-dirT.y, dirT.x);
  float a = dot(P.xz, dirT), b = dot(P.xz, perp);
  float core = exp(-pow(b / (0.34 * R), 2.0)) * exp(-pow((a - uFocus) / (0.95 * R), 2.0));
  float flare = smoothstep(R * 1.02, 0.1, abs(b)) * smoothstep(0.2, 1.8 * R, a) * (1.0 - 0.35 * smoothstep(2.0 * R, 4.0 * R, a));
  float inside = 1.0 - smoothstep(R * 0.80, R * 0.97, length(P.xz));
  float cp = 0.0;
  if (sm + inside > 0.01) cp = causticPattern(P.xz * 0.52 + vec2(0.13, 0.31) * sin(uTime * 0.11), uTime * 0.55);
  float pat = 0.30 + 1.9 * cp;
  float lit = mix(1.0, 0.34, sm) + sm * (6.0 * core * pat + 0.8 * flare * pat) + inside * 1.4 * cp;
  vec3 tint = mix(vec3(1.0), vec3(0.86, 0.96, 0.92), sm * 0.6) * mix(vec3(1.0), vec3(1.0, 0.88, 0.68), clamp(core * 1.5, 0.0, 1.0));
  reflectedLight.directDiffuse *= lit * tint;
  reflectedLight.directSpecular *= mix(1.0, 0.28, sm);
}`);
};
const table = new THREE.Mesh(new THREE.PlaneGeometry(56, 40), tableMat);
table.rotation.x = -Math.PI / 2;
table.position.set(0, 0, 4);
table.receiveShadow = true;
scene.add(table);

/* ---------- wall: stucco with soft panelling, plus out-of-focus lights for bokeh through the water ---------- */
function makeWallTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#16191a'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512), d = img.data;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const n = tnoise(x / 512 * 8, y / 512 * 8, 8, 8, 21) * 0.6 + tnoise(x / 512 * 32, y / 512 * 32, 32, 32, 22) * 0.4;
    const panel = (x % 128 < 3) ? 0.7 : 1.0;
    const v = (18 + 22 * n) * panel;
    const i = (y * 512 + x) * 4;
    d[i] = v * 0.92; d[i + 1] = v * 1.0; d[i + 2] = v * 1.02; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 2.4);
  return t;
}
const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 26),
  new THREE.MeshStandardMaterial({ map: makeWallTexture(), roughness: 0.95, metalness: 0, color: 0x9aa4a4 }));
wall.position.set(0, 12.6, -10);
wall.receiveShadow = true;
scene.add(wall);

const bokehTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.7)');
  gr.addColorStop(0.86, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 64, 0, TAU); g.fill();
  return new THREE.CanvasTexture(c);
})();
const bokeh = [];
{
  const br = mulberry(77);
  const pal = [[1.0, 0.62, 0.26], [1.0, 0.74, 0.40], [0.35, 0.85, 0.85], [1.0, 0.45, 0.2], [0.55, 0.75, 1.0]];
  for (let i = 0; i < 46; i++) {
    const p = pal[Math.floor(br() * pal.length)];
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bokehTex, color: new C().setRGB(p[0], p[1], p[2]), transparent: true, opacity: 0.1 + br() * 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    const s = 0.35 + br() * 1.1;
    sp.scale.set(s, s, 1);
    sp.position.set((br() - 0.5) * 30, 1.2 + br() * 8.5, -9.6 + br() * 0.5);
    sp.userData = { o: sp.material.opacity, ph: br() * 6.28, sp: 0.3 + br() * 0.8 };
    scene.add(sp); bokeh.push(sp);
  }
}

/* ---------- dust motes drifting through the lamp beam ---------- */
const dust = (() => {
  const n = 140, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  const dr = mulberry(9);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = -6 + dr() * 12; pos[i * 3 + 1] = 0.3 + dr() * 6.5; pos[i * 3 + 2] = -3 + dr() * 7;
    seed[i] = dr() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    map: bokehTex, size: 0.06, sizeAttenuation: true, color: 0xffd8a8, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, pos, seed, n };
})();
function updateDust(t, dt) {
  const p = dust.pos;
  for (let i = 0; i < dust.n; i++) {
    const s = dust.seed[i];
    p[i * 3] += Math.sin(t * 0.21 + s) * 0.05 * dt;
    p[i * 3 + 1] += (Math.sin(t * 0.17 + s * 1.3) * 0.03 + 0.012) * dt;
    p[i * 3 + 2] += Math.cos(t * 0.13 + s * 0.7) * 0.04 * dt;
    if (p[i * 3 + 1] > 7.2) p[i * 3 + 1] = 0.3;
  }
  dust.pts.geometry.attributes.position.needsUpdate = true;
}
