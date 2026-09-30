
/* ======================================================================
   THE OCTOPUS — soft mantle, eyes, siphon, eight tapering arms with suckers
   Skin shader: chromatophore speckle waves, wet clearcoat, rim glow, caustics
   ====================================================================== */
const NJ = 16, ARM_L = 2.05, SEG = ARM_L / (NJ - 1);
const SUBD = 2, NRING = (NJ - 1) * SUBD + 1, NRAD = 10, NS = 26;
const RING = { r: 0.40, y: -0.47 };           // where the arms leave the body (local)
const armRadius = s => 0.142 * Math.pow(1 - s, 0.85) * (1 + 0.25 * Math.exp(-s * 12)) + 0.008;

U.lampView = { value: new V3() };
const skinFlush = { value: 0 };

function makeSkinMaterial(opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: opts.rough ?? 0.46, metalness: 0,
    clearcoat: 0.55, clearcoatRoughness: 0.3,
    envMapIntensity: 1.3,
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uFlush = skinFlush; sh.uniforms.uLampView = U.lampView;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aPat; varying vec4 vPat; varying vec3 vWP;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vPat = aPat;
vec4 _w4 = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  _w4 = instanceMatrix * _w4;
#endif
vWP = (modelMatrix * _w4).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vPat; varying vec3 vWP; uniform float uTime; uniform float uFlush; uniform vec3 uLampView;
${GLSL_CAUSTIC}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 P = vPat.xyz; float ven = vPat.w; float t = uTime;
  float lo = vn3(P * 2.4 + 3.0);
  vec3 cA = vec3(0.44, 0.078, 0.034);
  vec3 cB = vec3(0.78, 0.30, 0.17);
  vec3 cC = vec3(0.10, 0.010, 0.022);
  vec3 cD = vec3(0.48, 0.10, 0.28);
  vec3 base = mix(cA, cB, smoothstep(0.35, 0.85, lo) * 0.55);
  base = mix(base, cD, smoothstep(0.55, 0.9, vn3(P * 1.7 + 9.0)) * 0.28);
  float wave = 0.5 + 0.5 * sin(t * 0.9 + P.y * 2.6 + P.x * 1.7 + lo * 5.0);
  float cells = vn3(P * 26.0 + vec3(0.0, 0.0, t * 0.12));
  float thr = mix(0.80, 0.55, clamp(wave * 0.75 + uFlush * 0.5, 0.0, 1.0));
  float spots = smoothstep(thr, thr + 0.12, cells);
  base = mix(base, cC, spots * (0.52 + 0.25 * uFlush));
  base *= 0.86 + 0.26 * wave;
  base = mix(base, vec3(0.42, 0.045, 0.07), uFlush * 0.42);
  base = mix(base, cB * 1.05, ven * 0.65);
  diffuseColor.rgb = base;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float nv = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  float fres = pow(1.0 - nv, 2.6);
  totalEmissiveRadiance += vec3(0.55, 0.16, 0.07) * fres * 0.40 * (1.0 + 0.7 * uFlush);
  float inJar = (1.0 - smoothstep(1.02, 1.2, length(vWP.xz))) * (1.0 - smoothstep(2.9, 3.35, vWP.y));
  if (inJar > 0.01) {
    float cp = causticPattern(vWP.xz * 0.62 + vWP.y * 0.21, uTime * 0.6);
    float ndl = max(dot(normal, normalize(uLampView + vViewPosition)), 0.0);
    totalEmissiveRadiance += vec3(1.0, 0.80, 0.52) * cp * (0.10 + 0.34 * ndl) * inJar;
  }
}`);
  };
  return m;
}
const skinMat = makeSkinMaterial();

/* ---------- mantle ---------- */
const MU = 64, MV = 48;
const MANTLE_PROFILE = [[0.0, -0.44], [0.18, -0.52], [0.40, -0.52], [0.54, -0.38], [0.64, -0.12], [0.69, 0.14],
  [0.65, 0.42], [0.55, 0.66], [0.40, 0.84], [0.22, 0.96], [0.0, 1.00]];
const mantleBase = new Float32Array((MU + 1) * (MV + 1) * 3);
const mantleGeo = new THREE.BufferGeometry();
{
  const curve = new THREE.SplineCurve(MANTLE_PROFILE.map(p => new THREE.Vector2(p[0], p[1])));
  const pts = curve.getSpacedPoints(MV);
  const pat = new Float32Array((MU + 1) * (MV + 1) * 4), idx = [];
  const nz = mulberry(3);
  for (let i = 0; i <= MU; i++) {
    const a = i / MU * TAU, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= MV; j++) {
      const p = pts[j], r = Math.max(0, p.x), y = p.y;
      const lean = 0.42 * Math.pow(sstep(0.0, 1.0, y), 1.5);
      const bump = 1 + 0.012 * Math.sin(a * 7 + y * 9) * Math.sin(y * 5 + a * 3);
      const v = (i * (MV + 1) + j) * 3;
      mantleBase[v] = r * ca * bump; mantleBase[v + 1] = y; mantleBase[v + 2] = r * sa * 0.94 * bump - lean;
      const q = (i * (MV + 1) + j) * 4;
      pat[q] = mantleBase[v]; pat[q + 1] = y; pat[q + 2] = mantleBase[v + 2]; pat[q + 3] = sstep(-0.30, -0.54, y);
    }
  }
  for (let i = 0; i < MU; i++) for (let j = 0; j < MV; j++) {
    const a = i * (MV + 1) + j, b = (i + 1) * (MV + 1) + j, c = a + 1, d = b + 1;
    idx.push(a, c, b, c, d, b);
  }
  mantleGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mantleBase), 3).setUsage(THREE.DynamicDrawUsage));
  mantleGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mantleBase.length), 3).setUsage(THREE.DynamicDrawUsage));
  mantleGeo.setAttribute('aPat', new THREE.BufferAttribute(pat, 4));
  mantleGeo.setIndex(idx);
}
const mantleMesh = new THREE.Mesh(mantleGeo, skinMat);
mantleMesh.castShadow = true; mantleMesh.receiveShadow = true; mantleMesh.frustumCulled = false;

/* ---------- eyes ---------- */
function makeEyeTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2b1309'; g.fillRect(0, 0, 512, 256);
  const cx = 128, cy = 128;
  let gr = g.createRadialGradient(cx, cy, 6, cx, cy, 58);
  gr.addColorStop(0, '#ffcf4a'); gr.addColorStop(0.35, '#f39a1f'); gr.addColorStop(0.75, '#b9560f'); gr.addColorStop(1, '#3a1a08');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 58, 0, TAU); g.fill();
  const er = mulberry(2);
  for (let i = 0; i < 160; i++) {
    const a = er() * TAU, r0 = 10 + er() * 12, r1 = r0 + 14 + er() * 30;
    g.strokeStyle = er() > 0.5 ? 'rgba(255,230,140,0.35)' : 'rgba(70,25,5,0.35)';
    g.lineWidth = 0.8 + er(); g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  g.strokeStyle = 'rgba(20,8,2,0.9)'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, 57, 0, TAU); g.stroke();
  g.fillStyle = '#050201';
  g.beginPath(); g.ellipse(cx, cy, 33, 8.5, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath(); g.ellipse(cx, cy, 39, 12, 0, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const eyeMat = new THREE.MeshPhysicalMaterial({
  map: makeEyeTexture(), roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2,
});
const eyeGeo = new THREE.SphereGeometry(0.175, 28, 20);
const eyes = [-1, 1].map(side => {
  const m = new THREE.Mesh(eyeGeo, eyeMat);
  m.castShadow = true; m.frustumCulled = false;
  m.userData = { side, local: new V3(side * 0.485, 0.03, 0.37), look: new Q() };
  return m;
});
const lidGeo = new THREE.TorusGeometry(0.172, 0.05, 10, 28);
{ const pat = new Float32Array(lidGeo.attributes.position.count * 4); for (let i = 0; i < pat.length; i += 4) { pat[i] = i * 0.013; pat[i + 1] = 0.3; pat[i + 2] = 0.2; pat[i + 3] = 0; } lidGeo.setAttribute('aPat', new THREE.BufferAttribute(pat, 4)); }
const eyelids = eyes.map(() => { const m = new THREE.Mesh(lidGeo, skinMat); m.castShadow = true; m.frustumCulled = false; return m; });

/* ---------- siphon ---------- */
const funnelGeo = new THREE.CylinderGeometry(0.048, 0.088, 0.26, 14, 1);
{ const pat = new Float32Array(funnelGeo.attributes.position.count * 4); for (let i = 0; i < pat.length; i += 4) { pat[i] = i * 0.02; pat[i + 1] = 0.1; pat[i + 2] = 0.5; pat[i + 3] = 0.45; } funnelGeo.setAttribute('aPat', new THREE.BufferAttribute(pat, 4)); }
const funnel = new THREE.Mesh(funnelGeo, skinMat);
funnel.castShadow = true; funnel.frustumCulled = false;

/* ---------- arms: dynamic tube meshes + instanced suckers ---------- */
const armIdx = [];
for (let k = 0; k < NRING - 1; k++) for (let m = 0; m < NRAD; m++) {
  const a = k * (NRAD + 1) + m, b = a + NRAD + 1, c = a + 1, d = b + 1;
  armIdx.push(a, b, c, c, b, d);
}
function makeArmMesh(i) {
  const g = new THREE.BufferGeometry();
  const n = NRING * (NRAD + 1);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const pat = new Float32Array(n * 4), sd = i * 3.17;
  for (let k = 0; k < NRING; k++) {
    const s = k / (NRING - 1);
    for (let m = 0; m <= NRAD; m++) {
      const a = m / NRAD * TAU, q = (k * (NRAD + 1) + m) * 4;
      pat[q] = s * 3.2 + sd; pat[q + 1] = Math.cos(a) * 0.42 + sd * 0.3; pat[q + 2] = Math.sin(a) * 0.42 - sd;
      pat[q + 3] = sstep(0.05, 0.85, Math.sin(a)) * 0.9 + 0.1 * s;
    }
  }
  g.setAttribute('aPat', new THREE.BufferAttribute(pat, 4));
  g.setIndex(armIdx);
  const mesh = new THREE.Mesh(g, skinMat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return mesh;
}
const armMeshes = Array.from({ length: 8 }, (_, i) => makeArmMesh(i));

const suckerProfile = [[0.88, -0.26], [1.0, -0.06], [0.97, 0.10], [0.82, 0.17], [0.63, 0.06], [0.40, -0.12], [0.0, -0.20]];
const suckerGeo = new THREE.LatheGeometry(suckerProfile.map(p => new THREE.Vector2(p[0], p[1])), 10);
{
  const cnt = suckerGeo.attributes.position.count, pat = new Float32Array(cnt * 4);
  for (let i = 0; i < cnt; i++) {
    const x = suckerGeo.attributes.position.getX(i), y = suckerGeo.attributes.position.getY(i), z = suckerGeo.attributes.position.getZ(i);
    pat[i * 4] = x * 6; pat[i * 4 + 1] = y * 6; pat[i * 4 + 2] = z * 6;
    pat[i * 4 + 3] = y > -0.05 ? 1.0 : 0.6;
  }
  suckerGeo.setAttribute('aPat', new THREE.BufferAttribute(pat, 4));
}
const suckers = new THREE.InstancedMesh(suckerGeo, skinMat, 8 * NS);
suckers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
suckers.castShadow = true; suckers.receiveShadow = true; suckers.frustumCulled = false;

/* ---------- x-ray ghost: the octopus seen through the brass cap (only where the cap hides it) ---------- */
const ghostU = { uOpacity: { value: 0 } };
const ghostMat = new THREE.ShaderMaterial({
  uniforms: ghostU,
  vertexShader: /* glsl */`
    attribute vec4 aPat; varying vec3 vN; varying vec3 vVp; varying float vVen;
    void main(){
      vec4 p = vec4(position, 1.0); vec3 n = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
      #endif
      vec4 mv = modelViewMatrix * p;
      vVp = mv.xyz; vN = normalize(normalMatrix * n); vVen = aPat.w;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uOpacity; varying vec3 vN; varying vec3 vVp; varying float vVen;
    void main(){
      vec3 N = normalize(vN); vec3 V = normalize(-vVp);
      float nv = abs(dot(N, V));
      float rim = pow(1.0 - nv, 2.0);
      float lit = 0.42 + 0.58 * max(dot(N, normalize(vec3(-0.35, 0.55, 0.75))), 0.0);
      vec3 base = mix(vec3(0.72, 0.18, 0.06), vec3(0.96, 0.50, 0.28), clamp(vVen, 0.0, 1.0));
      vec3 col = base * lit + vec3(1.0, 0.55, 0.22) * rim * 0.45;
      gl_FragColor = vec4(col, (0.36 + 0.30 * rim) * uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, depthTest: true, depthFunc: THREE.GreaterDepth,
  stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: 1,
});
const ghostMeshes = [];
{
  const add = m => { m.frustumCulled = false; m.renderOrder = 20; m.visible = false; ghostMeshes.push(m); return m; };
  add(new THREE.Mesh(mantleGeo, ghostMat));
  for (const am of armMeshes) add(new THREE.Mesh(am.geometry, ghostMat));
  const gs = new THREE.InstancedMesh(suckerGeo, ghostMat, 8 * NS);
  gs.instanceMatrix = suckers.instanceMatrix;
  add(gs);
}

const octGroup = new THREE.Group();
octGroup.add(mantleMesh, funnel, ...eyes, ...eyelids, ...armMeshes, suckers, ...ghostMeshes);
scene.add(octGroup);

/* body pose */
const body = {
  pos: new V3(0, 0.66, 0), quat: new Q(), sy: 1, breath: 0,
  yaw: 0, flip: 0, squeezeOn: 1, lookAt: new V3(0, 1.6, 9), blink: 0, _bt: 2.5,
};
const _bv = new V3();
/* the neck limits how wide anything can be — a soft, smooth clamp on radial distance */
function squeezeLimit(y) {
  const base = rInAt(Math.min(y, JAR.rim)) - 0.05;
  return base + 5.0 * sstep(JAR.rim + 0.03, JAR.rim + 0.42, y);
}
function squeezeVec(p, w = body.squeezeOn) {
  if (w <= 0.001) return p;
  const r = Math.hypot(p.x, p.z);
  if (r < 1e-5) return p;
  const lim = squeezeLimit(p.y);
  const q = r / lim, k = r / Math.pow(1 + Math.pow(q, 7), 1 / 7);
  const rr = lerp(r, k, w);
  p.x *= rr / r; p.z *= rr / r;
  return p;
}
function bodyToWorld(local, out) {
  out.copy(local).applyQuaternion(body.quat).add(body.pos);
  return out;
}
const mpos = mantleGeo.attributes.position;
function updateMantle() {
  const sy = body.sy, sxz = 1 / Math.sqrt(sy), k = 1 + 0.035 * body.breath, ky = 1 - 0.02 * body.breath;
  const a = mpos.array, e = body.quat;
  const w = body.squeezeOn;
  const fl = JAR.floor + 0.005;
  const inJar = 1 - sstep(0.9, 1.6, Math.hypot(body.pos.x, body.pos.z));
  body.squeezeOn = inJar;
  for (let i = 0; i < mantleBase.length; i += 3) {
    _bv.set(mantleBase[i] * sxz * k, mantleBase[i + 1] * sy * ky, mantleBase[i + 2] * sxz * k)
      .applyQuaternion(e).add(body.pos);
    squeezeVec(_bv, inJar);
    if (inJar > 0.5 && _bv.y < fl && Math.hypot(_bv.x, _bv.z) < 1.15) _bv.y = fl + (_bv.y - fl) * 0.1;
    a[i] = _bv.x; a[i + 1] = _bv.y; a[i + 2] = _bv.z;
  }
  mpos.needsUpdate = true;
  mantleGeo.computeVertexNormals();
  // weld the seam normals
  const nrm = mantleGeo.attributes.normal.array, L = MV + 1, last = MU * L;
  for (let j = 0; j < L; j++) {
    const a0 = j * 3, b0 = (last + j) * 3;
    const x = nrm[a0] + nrm[b0], y = nrm[a0 + 1] + nrm[b0 + 1], z = nrm[a0 + 2] + nrm[b0 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nrm[a0] = nrm[b0] = x / l; nrm[a0 + 1] = nrm[b0 + 1] = y / l; nrm[a0 + 2] = nrm[b0 + 2] = z / l;
  }
  // pole normals
  mantleGeo.attributes.normal.needsUpdate = true;
  mantleGeo.boundingSphere = null;
}

const _ey = new V3(), _fz = new V3(), _tt = new V3(), _qq = new Q(), _qp = new Q(), _qi = new Q(), _qbase = new Q(), _Z = new V3(0, 0, 1), _Yv = new V3(0, 1, 0), _fd = new V3(0, -0.5, 0.87).normalize();
const _cx = new V3(), _hz = new V3(), _ex = new V3(), _fw = new V3(), _qr = new Q();
function levelPupil(q) {          // octopus eyes keep their slit horizontal whatever the body does
  _fw.set(0, 0, 1).applyQuaternion(q);
  _hz.crossVectors(_Yv, _fw);
  const l = _hz.length();
  if (l < 0.25) return;
  _hz.multiplyScalar(1 / l);
  _ex.set(1, 0, 0).applyQuaternion(q);
  let ang = Math.atan2(_cx.crossVectors(_ex, _hz).dot(_fw), _ex.dot(_hz));
  if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
  _qr.setFromAxisAngle(_fw, ang * Math.min(1, (l - 0.25) * 4));
  q.premultiply(_qr);
}
function updateEyes(dt) {
  body._bt -= dt;
  if (body._bt < 0) { body.blink = 0.001; body._bt = 2.2 + rand() * 4; }
  if (body.blink > 0) { body.blink += dt * 9; if (body.blink >= 2) body.blink = 0; }
  const bl = body.blink > 0 ? Math.abs(1 - body.blink) : 1;    // 1 open -> 0 closed -> 1
  _qi.copy(body.quat).invert();
  const sq = 1 / Math.sqrt(body.sy);
  eyes.forEach((eye, i) => {
    const ud = eye.userData;
    bodyToWorld(ud.local, _ey);
    squeezeVec(_ey, body.squeezeOn);
    // gaze: turn from the natural outward direction toward the look target, within a clamped cone
    _fz.set(ud.side * 0.42, 0.0, 0.9).normalize();
    _tt.copy(body.lookAt).sub(_ey).applyQuaternion(_qi).normalize();
    const ang = Math.max(1e-3, _fz.angleTo(_tt));
    _qq.setFromUnitVectors(_fz, _tt);
    _qp.identity().slerp(_qq, Math.min(1, 0.55 / ang) * 0.8);
    _qbase.setFromUnitVectors(_Z, _fz);
    _qp.multiply(_qbase);
    ud.look.slerp(_qp, 1 - Math.exp(-9 * dt));
    eye.quaternion.copy(body.quat).multiply(ud.look);
    levelPupil(eye.quaternion);
    eye.position.copy(_ey);
    eye.scale.set(sq, Math.max(0.06, bl) * sq, sq);
    const lidm = eyelids[i];
    lidm.quaternion.copy(eye.quaternion);
    lidm.position.copy(_ey);
    lidm.scale.set(sq, sq * (0.35 + 0.65 * bl), sq);
  });
  // siphon
  _tt.set(0, -0.33, 0.50); bodyToWorld(_tt, _ey); squeezeVec(_ey, body.squeezeOn);
  funnel.position.copy(_ey);
  _qq.setFromUnitVectors(_Yv, _fd);
  funnel.quaternion.copy(body.quat).multiply(_qq);
}
