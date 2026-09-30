
/* ======================================================================
   THE JAR — lathe-built glass, threaded neck, refractive water, bubbles
   ====================================================================== */
function bez(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
function arcPts(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}

const shoulderOut = bez([1.25, 2.40], [1.25, 2.82], [0.715, 2.66], [0.715, 3.02], 18);
const shoulderIn = bez([0.595, 2.98], [0.595, 2.64], [1.18, 2.80], [1.18, 2.36], 18);

const outerLoop = [
  [0, 0], [0.5, 0], ...arcPts(0.97, 0.28, 0.28, -Math.PI / 2, 0, 8),
  [1.25, 1.2], ...shoulderOut,
  [0.715, 3.25], [0.715, 3.40], [0.712, 3.416], [0.69, 3.433], [0.655, 3.44], [0.617, 3.433], [0.599, 3.416],
  [0.595, 3.30], [0.595, 3.0], ...shoulderIn.slice(1),
  [1.18, 1.2], ...arcPts(0.93, 0.37, 0.25, 0, -Math.PI / 2, 8), [0.5, 0.12], [0, 0.12],
];
const waterLoop = [
  [0, 0.124], [0.5, 0.124], ...arcPts(0.93, 0.37, 0.244, -Math.PI / 2, 0, 8),
  [1.174, 1.2], ...shoulderIn.slice().reverse().map(p => [p[0] - 0.006, p[1]]),
  [0.589, 3.2], [0.589, JAR.water], [0.3, JAR.water], [0, JAR.water],
];
const dedupe = pts => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4);
const toV2 = pts => dedupe(pts).map(p => new THREE.Vector2(p[0], p[1]));

/* analytic lookups used by the soft-body / tentacle collision */
function makeLookup(pts) { // pts: [r,y]; returns r(y)
  const a = pts.slice().sort((p, q) => p[1] - q[1]);
  return y => {
    if (y <= a[0][1]) return a[0][0];
    if (y >= a[a.length - 1][1]) return a[a.length - 1][0];
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m][1] > y) hi = m; else lo = m; }
    const t = (y - a[lo][1]) / (a[hi][1] - a[lo][1] || 1);
    return lerp(a[lo][0], a[hi][0], t);
  };
}
const shOutLook = makeLookup(shoulderOut), shInLook = makeLookup(shoulderIn);
function rOutAt(y) {
  if (y < 0.28) return 0.97 + Math.sqrt(Math.max(0, 0.28 * 0.28 - (0.28 - y) * (0.28 - y)));
  if (y <= JAR.sh0) return JAR.R;
  if (y >= JAR.sh1) return JAR.neckR;
  return shOutLook(y);
}
function rInAt(y) {
  if (y < 0.37) return 0.93 + Math.sqrt(Math.max(0, 0.25 * 0.25 - (0.37 - y) * (0.37 - y)));
  if (y <= 2.36) return JAR.Rin;
  if (y >= 2.98) return JAR.neckIn;
  return shInLook(y);
}
/* outward unit normal of the outer wall at height y, azimuth a (angle in xz: x=cos, z=-sin) */
function jarOuterNormal(y, a, out) {
  const e = 0.02, slope = (rOutAt(y + e) - rOutAt(y - e)) / (2 * e);
  const rx = Math.cos(a), rz = -Math.sin(a);
  out.set(rx, -slope, rz).normalize();
  return out;
}
function jarOuterPoint(y, a, out) {
  const r = rOutAt(y);
  return out.set(r * Math.cos(a), y, -r * Math.sin(a));
}

/* ---------- glass + water shaders ---------- */
const glassVert = /* glsl */`
varying vec3 vW; varying vec3 vN;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const glassFrag = /* glsl */`
uniform samplerCube tEnv; uniform vec3 uCam; uniform vec3 uLamp; uniform float uTime; uniform float uBack;
varying vec3 vW; varying vec3 vN;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vW);
  float NV = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.045 + 0.955 * pow(1.0 - NV, 5.0);
  vec3 R = reflect(-V, N);
  vec3 env = textureLod(tEnv, R, 1.3).rgb;
  float edge = pow(1.0 - NV, 3.0);
  float aAbs = 0.035 + 0.40 * edge;
  float gain = 1.0;
  if (uBack > 0.5) { gain = 0.75; aAbs *= 0.55; }
  vec3 col = env * F * gain + vec3(0.010, 0.040, 0.034) * aAbs * 0.9;
  vec3 L = normalize(uLamp - vW), H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), 900.0);
  col += vec3(1.0, 0.72, 0.42) * sp * 2.2 * gain;
  col *= 1.0 + 0.04 * sin(vW.y * 38.0 + vW.x * 6.0);
  gl_FragColor = vec4(col, clamp(aAbs, 0.0, 0.9));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const waterFrag = /* glsl */`
uniform sampler2D tRefr; uniform samplerCube tEnv; uniform mat4 uViewProj; uniform vec3 uCam; uniform vec3 uLamp;
uniform float uTime; uniform float uThud;
varying vec3 vW; varying vec3 vN;
vec2 projUV(vec3 wp){ vec4 c = uViewProj * vec4(wp, 1.0); return clamp(c.xy / c.w * 0.5 + 0.5, 0.001, 0.999); }
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (N.y > 0.85) {
    N = normalize(N + vec3(sin(vW.x * 11.0 + uTime * 1.4 + uThud * 30.0) * 0.012, 0.0, cos(vW.z * 9.0 + uTime * 1.1) * 0.012));
  }
  float NV = clamp(dot(N, V), 0.0, 1.0);
  vec3 I = -V;
  vec3 Ih = normalize(vec3(I.x, 0.0, I.z) + 1e-5);
  vec3 toAxis = vec3(-vW.x, 0.0, -vW.z);
  float isFlat = smoothstep(0.3, 0.8, abs(N.y));
  vec3 Rr = refract(I, N, 1.0 / 1.333);
  vec3 Rg = refract(I, N, 1.0 / 1.338);
  vec3 Rb = refract(I, N, 1.0 / 1.347);
  float tr = mix(clamp(dot(toAxis, Ih) / max(dot(Rr, Ih), 0.2), 0.05, 3.2), 1.3, isFlat);
  float tg = mix(clamp(dot(toAxis, Ih) / max(dot(Rg, Ih), 0.2), 0.05, 3.2), 1.3, isFlat);
  float tb = mix(clamp(dot(toAxis, Ih) / max(dot(Rb, Ih), 0.2), 0.05, 3.2), 1.3, isFlat);
  vec3 sr = texture2D(tRefr, projUV(vW + Rr * tr)).rgb;
  vec3 sg = texture2D(tRefr, projUV(vW + Rg * tg)).rgb;
  vec3 sb = texture2D(tRefr, projUV(vW + Rb * tb)).rgb;
  vec3 col = vec3(sr.r, sg.g, sb.b);
  float pathLen = mix(2.36 * NV * 0.78, 1.2, isFlat);
  col *= exp(-vec3(0.42, 0.11, 0.075) * pathLen);
  vec3 L = normalize(uLamp - vW);
  float lit = 0.45 + 0.55 * max(dot(normalize(vec3(N.x, 0.25, N.z)), L), 0.0);
  col += vec3(0.0022, 0.0090, 0.0105) * (1.0 - exp(-pathLen * 0.9)) * lit;
  float F = 0.02 + 0.98 * pow(1.0 - NV, 5.0);
  vec3 env = textureLod(tEnv, reflect(I, N), 0.8).rgb;
  col += env * F;
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.75, 0.45) * pow(max(dot(N, H), 0.0), 500.0) * 1.2;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const glassUniforms = { tEnv: U.env, uCam: U.camPos, uLamp: U.lamp, uTime: U.time };
function glassMat(back) {
  return new THREE.ShaderMaterial({
    uniforms: { ...glassUniforms, uBack: { value: back ? 1 : 0 } },
    vertexShader: glassVert, fragmentShader: glassFrag,
    transparent: true, depthWrite: false, side: back ? THREE.BackSide : THREE.FrontSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}
const waterMat = new THREE.ShaderMaterial({
  uniforms: { tRefr: U.refr, tEnv: U.env, uViewProj: U.viewProj, uCam: U.camPos, uLamp: U.lamp, uTime: U.time, uThud: U.thud },
  vertexShader: glassVert, fragmentShader: waterFrag,
  transparent: true, depthWrite: false, side: THREE.FrontSide,
});

/* ---------- the thread: a helical ridge wound on the neck ---------- */
function buildThreadGeometry() {
  const turns = 4.3, steps = Math.round(turns * 56), y0 = 3.075, pitch = LID.pitch;
  // right-handed helix: y rises as the angle grows counter-clockwise seen from above
  const prof = [[-0.011, 0.0], [-0.0085, 0.038], [0, 0.058], [0.0085, 0.038], [0.011, 0.0]]; // [dy, dr]
  const rBase = JAR.neckR - 0.004;
  const pos = [], idx = [];
  const nP = prof.length;
  for (let i = 0; i <= steps; i++) {
    const phi = i / steps * turns * TAU;
    const yc = y0 + pitch * phi / TAU;
    const fade = sstep(0, 0.12, i / steps) * (1 - sstep(0.93, 1.0, i / steps)); // run-out at both ends
    for (let k = 0; k < nP; k++) {
      const r = rBase + prof[k][1] * fade;
      pos.push(r * Math.cos(phi), yc + prof[k][0], -r * Math.sin(phi));
    }
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < nP - 1; k++) {
    const a = i * nP + k, b = a + 1, c = a + nP, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- assemble ---------- */
const jar = new THREE.Group();
scene.add(jar);
const glassGeo = new THREE.LatheGeometry(toV2(outerLoop), 96);
const threadGeo = buildThreadGeometry();
const waterGeo = new THREE.LatheGeometry(toV2(waterLoop), 72);
const glassBack = new THREE.Mesh(glassGeo, glassMat(true));
const glassFront = new THREE.Mesh(glassGeo, glassMat(false));
const threadBack = new THREE.Mesh(threadGeo, glassMat(true));
const threadFront = new THREE.Mesh(threadGeo, glassMat(false));
const water = new THREE.Mesh(waterGeo, waterMat);
water.renderOrder = 2;
glassBack.renderOrder = 3; threadBack.renderOrder = 3;
glassFront.renderOrder = 4; threadFront.renderOrder = 4;
const glassLayers = [water, glassBack, threadBack, glassFront, threadFront];
for (const m of glassLayers) { m.frustumCulled = false; jar.add(m); }

/* soft contact shadow ring where the glass meets the wood */
const contact = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0.55, 'rgba(0,0,0,0)'); gr.addColorStop(0.645, 'rgba(0,0,0,0.6)');
  gr.addColorStop(0.72, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.004; m.renderOrder = 1;
  scene.add(m);
  return m;
})();

/* ---------- bubbles ---------- */
const MAXB = 90;
const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
const bubbleMat = new THREE.ShaderMaterial({
  uniforms: { tEnv: U.env, uCam: U.camPos },
  vertexShader: /* glsl */`
    varying vec3 vW; varying vec3 vN;
    void main(){
      mat4 m = modelMatrix * instanceMatrix;
      vec4 w = m * vec4(position, 1.0);
      vW = w.xyz; vN = normalize(mat3(m) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */`
    uniform samplerCube tEnv; uniform vec3 uCam; varying vec3 vW; varying vec3 vN;
    void main(){
      vec3 N = normalize(vN), V = normalize(uCam - vW);
      float NV = abs(dot(N, V));
      float rim = pow(1.0 - NV, 2.4);
      vec3 env = textureLod(tEnv, reflect(-V, N), 0.0).rgb;
      vec3 col = env * (0.06 + 0.9 * rim) + vec3(0.55, 0.85, 0.95) * rim * 0.22;
      gl_FragColor = vec4(col, clamp(rim * 0.6 + 0.03, 0.0, 0.7));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
});
const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, MAXB);
bubbles.frustumCulled = false; bubbles.renderOrder = 5;
scene.add(bubbles);
const bub = { p: [], v: [], s: [], life: [], ph: [] };
for (let i = 0; i < MAXB; i++) { bub.p.push(new V3(0, -10, 0)); bub.v.push(new V3()); bub.s.push(0); bub.life.push(0); bub.ph.push(rand() * 6.28); }
let bubCursor = 0;
function emitBubble(x, y, z, size, vy) {
  const i = bubCursor; bubCursor = (bubCursor + 1) % MAXB;
  bub.p[i].set(x, y, z); bub.v[i].set((rand() - 0.5) * 0.08, vy, (rand() - 0.5) * 0.08);
  bub.s[i] = size; bub.life[i] = 1;
}
const _bm = new M4(), _bq = new Q(), _bs = new V3();
function updateBubbles(dt, t) {
  for (let i = 0; i < MAXB; i++) {
    if (bub.life[i] > 0) {
      const p = bub.p[i], v = bub.v[i];
      v.y = Math.min(v.y + 0.25 * dt, 0.95);
      p.x += (v.x + Math.sin(t * 2.3 + bub.ph[i]) * 0.04) * dt;
      p.z += (v.z + Math.cos(t * 1.9 + bub.ph[i]) * 0.04) * dt;
      p.y += v.y * dt;
      const lim = rInAt(p.y) - bub.s[i] - 0.02;
      const r = Math.hypot(p.x, p.z);
      if (r > lim) { p.x *= lim / r; p.z *= lim / r; }
      if (p.y > JAR.water - bub.s[i]) bub.life[i] = 0;
    }
    const s = bub.life[i] > 0 ? bub.s[i] : 0;
    _bs.set(s, s, s);
    _bm.compose(bub.p[i], _bq, _bs);
    bubbles.setMatrixAt(i, _bm);
  }
  bubbles.instanceMatrix.needsUpdate = true;
}
function burstBubbles(pos, n, spread = 0.3) {
  for (let i = 0; i < n; i++) {
    emitBubble(pos.x + (rand() - 0.5) * spread, pos.y + (rand() - 0.5) * spread * 0.5, pos.z + (rand() - 0.5) * spread,
      0.018 + rand() * 0.04, 0.2 + rand() * 0.5);
  }
}
