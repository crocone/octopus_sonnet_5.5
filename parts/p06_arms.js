
/* ======================================================================
   TENTACLES — position-based chains solved with a FABRIK-style reach pass
   (goal: the last few joints lie flat on a surface, suckers facing it),
   distance + bend limits for visible per-segment curvature, collision
   with glass, table, lid underside and the body itself.
   ====================================================================== */
const SUCKER_S = (() => {
  const raw = []; let s = 0;
  while (raw.length < NS) { raw.push(s); s += 1.02 * armRadius(Math.min(s, 0.95)) / ARM_L; }
  const a = 0.11, b = 0.95, mx = raw[raw.length - 1] || 1;
  return raw.map(v => a + (b - a) * v / mx);
})();

const armUp = new V3(0, 1, 0);
class Arm {
  constructor(i) {
    this.i = i;
    this.ang = i * TAU / 8;
    this.p = Array.from({ length: NJ }, () => new V3());
    this.q = Array.from({ length: NJ }, () => new V3());
    this.side = new Int8Array(NJ).fill(1);
    this.rad = new Float32Array(NJ);
    for (let j = 0; j < NJ; j++) this.rad[j] = armRadius(j / (NJ - 1)) * 0.92;
    this.base = new V3(); this.baseDir = new V3();
    this.ft = Array.from({ length: NJ }, () => new V3());
    this.fn = Array.from({ length: NJ }, () => new V3(0, -1, 0));
    this.cw = new Float32Array(NJ);
    this.tgt = { on: false, P: new V3(), N: new V3(0, 1, 0), D: new V3(1, 0, 0), w: 0, M: 4, g: 0 };
    this.free = { on: false, P: new V3(), w: 0 };
    this.acc = new V3(0, -0.5, 0);
    this.wave = { amp: 0.0, freq: 1, axis: new V3(0, 0, 1), phase: i * 0.9 };
    this.damp = 0.90;
    this.maxBend = 0.78;
    this.smooth = 0.05;
    this.pinned = false;
    this.tremor = 0;
    this.seed = i * 1.713;
  }
}
const arms = Array.from({ length: 8 }, (_, i) => new Arm(i));

const _a1 = new V3(), _a2 = new V3(), _a3 = new V3(), _a4 = new V3();
const _ringL = new V3(), _dirL = new V3(), _qInv = new Q();
function armBaseUpdate(arm) {
  const a = arm.ang;
  _ringL.set(Math.cos(a) * RING.r * 0.9, RING.y + 0.05, Math.sin(a) * RING.r * 0.9);
  bodyToWorld(_ringL, arm.base);
  squeezeVec(arm.base, body.squeezeOn);
  _dirL.set(Math.cos(a) * 0.78, -0.62, Math.sin(a) * 0.78).normalize().applyQuaternion(body.quat);
  arm.baseDir.copy(_dirL);
}
function armReset(arm, floorY) {
  armBaseUpdate(arm);
  arm.tgt.on = false; arm.tgt.g = 0; arm.tgt.w = 0; arm.free.on = false; arm.free.w = 0; arm.cw.fill(0);
  arm.side.fill(1);
  const p = arm.p;
  p[0].copy(arm.base);
  for (let j = 1; j < NJ; j++) {
    p[j].copy(p[j - 1]).addScaledVector(arm.baseDir, SEG);
    if (p[j].y < floorY + arm.rad[j]) p[j].y = floorY + arm.rad[j];
    arm.baseDir.lerp(_a1.set(Math.cos(arm.ang + 0.6), 0, -Math.sin(arm.ang + 0.6)), 0.12);
    arm.q[j].copy(p[j]);
  }
  arm.q[0].copy(p[0]);
}

/* ----- contact / target API ----- */
function armTarget(arm, P, N, D, w, g, M = 4) {
  const t = arm.tgt;
  t.on = true; t.P.copy(P); t.N.copy(N); t.D.copy(D); t.w = w; t.g = g; t.M = M;
}
function armRelease(arm) { arm.tgt.on = false; arm.tgt.g = 0; }
function armFree(arm, P, w) { const f = arm.free; f.on = w > 0; f.P.copy(P); f.w = w; }

const _G = Array.from({ length: 8 }, () => new V3());
function applyTargets(arm) {
  const p = arm.p, tg = arm.tgt, fr = arm.free;
  if (tg.on && tg.w > 0.001) {
    const M = tg.M, first = NJ - M;
    for (let k = 0; k < M; k++) {
      const j = first + k;
      _G[k].copy(tg.P).addScaledVector(tg.N, arm.rad[j] * 0.95).addScaledVector(tg.D, -(M - 1 - k) * SEG * 0.94);
      p[j].lerp(_G[k], tg.w);
    }
    for (let j = first - 1; j >= 1; j--) {           // backward reach
      _a1.subVectors(p[j], p[j + 1]); const l = _a1.length() || 1;
      p[j].copy(p[j + 1]).addScaledVector(_a1, SEG / l);
    }
    p[0].copy(arm.base);
    for (let j = 1; j < first; j++) {                 // forward reach
      _a1.subVectors(p[j], p[j - 1]); const l = _a1.length() || 1;
      p[j].copy(p[j - 1]).addScaledVector(_a1, SEG / l);
    }
  } else if (fr.on && fr.w > 0.001) {
    p[NJ - 1].lerp(fr.P, fr.w);
    for (let j = NJ - 2; j >= 1; j--) {
      _a1.subVectors(p[j], p[j + 1]); const l = _a1.length() || 1;
      p[j].copy(p[j + 1]).addScaledVector(_a1, SEG / l);
    }
    p[0].copy(arm.base);
    for (let j = 1; j < NJ; j++) {
      _a1.subVectors(p[j], p[j - 1]); const l = _a1.length() || 1;
      p[j].copy(p[j - 1]).addScaledVector(_a1, SEG / l);
    }
  }
}
function solveDistance(arm) {
  const p = arm.p, tg = arm.tgt;
  const first = (tg.on && tg.w > 0.9) ? NJ - tg.M : NJ + 1;
  for (let j = 0; j < NJ - 1; j++) {
    _a1.subVectors(p[j + 1], p[j]);
    const l = _a1.length() || 1e-6, diff = (l - SEG) / l;
    const wa = j === 0 ? 0 : (j >= first ? 0 : 1), wb = (j + 1 >= first) ? 0 : 1;
    const ws = wa + wb; if (ws === 0) continue;
    p[j].addScaledVector(_a1, diff * wa / ws);
    p[j + 1].addScaledVector(_a1, -diff * wb / ws);
  }
}
function solveBend(arm) {
  const p = arm.p, tg = arm.tgt;
  const first = (tg.on && tg.w > 0.9) ? NJ - tg.M : NJ + 1;
  const minChord = 2 * SEG * Math.cos(arm.maxBend / 2);
  for (let j = 1; j < NJ - 1; j++) {
    const A = p[j - 1], Bm = p[j + 1];
    _a1.subVectors(Bm, A); const l = _a1.length() || 1e-6;
    if (l < minChord) {
      const push = (minChord - l) * 0.5 / l;
      if (j - 1 > 0) A.addScaledVector(_a1, -push * (j - 1 >= first ? 0 : 1));
      if (j + 1 < first) Bm.addScaledVector(_a1, push);
    }
    if (j < first - 1 && arm.smooth > 0) {
      _a2.addVectors(A, Bm).multiplyScalar(0.5);
      p[j].lerp(_a2, arm.smooth);
    }
  }
}
let lidCeilOn = true;
function collideJoint(arm, j) {
  const P = arm.p[j], rad = arm.rad[j];
  let side = arm.side[j];
  const r = Math.hypot(P.x, P.z);
  const rim = JAR.rim;
  if (P.y > rim + rad * 0.5) side = 0;
  else if (side === 0) {
    const y = Math.max(0.2, P.y);
    side = r < (rInAt(y) + rOutAt(y)) * 0.5 ? 1 : -1;
  }
  arm.side[j] = side;
  if (side === 1) {
    const lim = rInAt(Math.min(P.y, rim)) - rad;
    if (r > lim && r > 1e-5) { P.x *= lim / r; P.z *= lim / r; }
    if (P.y < JAR.floor + rad) P.y = JAR.floor + rad;
  } else if (side === -1) {
    const lim = rOutAt(Math.min(P.y, rim)) + rad;
    if (r < lim) { if (r > 1e-5) { P.x *= lim / r; P.z *= lim / r; } else P.x = lim; }
    if (P.y < rad) P.y = rad;
  } else {
    if (r > JAR.neckIn - rad * 0.3 && r < JAR.neckR + rad * 0.3 && P.y < rim + rad) P.y = rim + rad;
    if (P.y < rad) P.y = rad;
  }
  if (lid.mode === 'thread' && r < 0.735 && P.y < lidUnderY() + 0.12) {
    const cy = lidUnderY() - rad;
    if (P.y > cy) P.y = cy;
  }
}
function collideBody(arm, j) {
  if (j < 3) return;
  const P = arm.p[j], rad = arm.rad[j];
  _qInv.copy(body.quat).invert();
  _a3.copy(P).sub(body.pos).applyQuaternion(_qInv);
  const ay = -0.12, by = 0.70;
  const t = clamp((_a3.y - ay) / (by - ay), 0, 1);
  _a4.set(0, ay + (by - ay) * t, 0);
  _a3.sub(_a4);
  const d = _a3.length(), minD = 0.60 + rad;
  if (d < minD) {
    if (d < 1e-5) _a3.set(1, 0, 0); else _a3.multiplyScalar(1 / d);
    _a3.multiplyScalar(minD).add(_a4).applyQuaternion(body.quat).add(body.pos);
    P.lerp(_a3, 0.7);
  }
}
function stepArm(arm, h, t) {
  const p = arm.p, q = arm.q;
  const damp = Math.pow(arm.damp, h * 60);
  const ww = arm.wave;
  for (let j = 1; j < NJ; j++) {
    _a1.subVectors(p[j], q[j]).multiplyScalar(damp);
    q[j].copy(p[j]);
    p[j].add(_a1);
    p[j].addScaledVector(arm.acc, h * h);
    if (ww.amp > 0) {
      const s = j / (NJ - 1);
      const w = Math.sin(t * ww.freq * 2.1 + j * 0.62 + ww.phase) * ww.amp * s * s;
      p[j].addScaledVector(ww.axis, w * h * h);
    }
    if (arm.tremor > 0) {
      const s = j / (NJ - 1);
      p[j].x += Math.sin(t * 57 + j * 1.9 + arm.seed) * arm.tremor * 0.0016 * s;
      p[j].y += Math.sin(t * 49 + j * 2.3 + arm.seed) * arm.tremor * 0.0012 * s;
    }
  }
  for (let it = 0; it < 4; it++) {
    p[0].copy(arm.base);
    applyTargets(arm);
    solveDistance(arm);
    solveBend(arm);
    for (let j = 1; j < NJ; j++) { collideJoint(arm, j); collideBody(arm, j); }
    // the first segment leaves the body along its natural direction
    _a1.subVectors(p[1], p[0]).normalize();
    if (_a1.dot(arm.baseDir) < 0.55) {
      _a1.lerp(arm.baseDir, 0.4).normalize();
      p[1].copy(p[0]).addScaledVector(_a1, SEG);
    }
  }
  p[0].copy(arm.base);
}

/* ----- frames, contact weights, render ----- */
const _ctr = Array.from({ length: NRING }, () => new V3());
const _rt = Array.from({ length: NRING }, () => new V3());
const _rn = Array.from({ length: NRING }, () => new V3());
const _rb = Array.from({ length: NRING }, () => new V3());
const _rr = new Float32Array(NRING), _rcw = new Float32Array(NRING);
const _bodyUp = new V3();
function computeFrames(arm) {
  const p = arm.p, tg = arm.tgt;
  arm.cw.fill(0);
  if (tg.on && tg.g > 0.001) {
    const first = NJ - tg.M;
    for (let j = first; j < NJ; j++) arm.cw[j] = tg.g;
    for (let k = 1; k <= 3; k++) if (first - k >= 0) arm.cw[first - k] = tg.g * (1 - k / 4);
  }
  for (let j = 0; j < NJ; j++) {
    _a1.subVectors(p[Math.min(j + 1, NJ - 1)], p[Math.max(j - 1, 0)]).normalize();
    arm.ft[j].copy(_a1);
  }
  _bodyUp.set(0, -1, 0).applyQuaternion(body.quat);            // suckers face the belly side
  let n = arm.fn[0];
  n.copy(_bodyUp).addScaledVector(arm.ft[0], -_bodyUp.dot(arm.ft[0]));
  if (n.lengthSq() < 1e-4) n.set(0, -1, 0).addScaledVector(arm.ft[0], arm.ft[0].y);
  n.normalize();
  for (let j = 1; j < NJ; j++) {
    const prev = arm.fn[j - 1], cur = arm.fn[j], t = arm.ft[j];
    cur.copy(prev).addScaledVector(t, -prev.dot(t));
    if (cur.lengthSq() < 1e-4) cur.set(0, -1, 0).addScaledVector(t, t.y);
    cur.normalize();
    const cw = arm.cw[j];
    if (cw > 0.001) {
      cur.lerp(_a2.copy(tg.N).multiplyScalar(-1), cw);
      cur.addScaledVector(t, -cur.dot(t)).normalize();
    }
  }
}
const _cp = [new V3(), new V3(), new V3(), new V3()];
function catmull(p0, p1, p2, p3, f, out) {
  const f2 = f * f, f3 = f2 * f;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * f + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f3);
  out.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * f + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * f2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * f3);
  out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * f + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * f2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * f3);
  return out;
}
function updateArmMesh(arm, mesh) {
  const p = arm.p, pos = mesh.geometry.attributes.position.array, nor = mesh.geometry.attributes.normal.array;
  for (let k = 0; k < NRING; k++) {
    const u = k / (NRING - 1) * (NJ - 1);
    const j = Math.min(NJ - 2, Math.floor(u)), f = u - j;
    catmull(p[Math.max(j - 1, 0)], p[j], p[j + 1], p[Math.min(j + 2, NJ - 1)], f, _ctr[k]);
    _rr[k] = lerp(arm.rad[j], arm.rad[j + 1], f) / 0.92;
    _rn[k].copy(arm.fn[j]).lerp(arm.fn[j + 1], f);
  }
  for (let k = 0; k < NRING; k++) {
    _rt[k].subVectors(_ctr[Math.min(k + 1, NRING - 1)], _ctr[Math.max(k - 1, 0)]).normalize();
    _rn[k].addScaledVector(_rt[k], -_rn[k].dot(_rt[k])).normalize();
    _rb[k].crossVectors(_rt[k], _rn[k]);
  }
  let o = 0;
  for (let k = 0; k < NRING; k++) {
    const c = _ctr[k], b = _rb[k], n = _rn[k], r = _rr[k];
    for (let m = 0; m <= NRAD; m++) {
      const a = m / NRAD * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const ax = 1.06, ay = sa > 0 ? 0.80 : 0.98;
      pos[o] = c.x + b.x * r * ax * ca + n.x * r * ay * sa;
      pos[o + 1] = c.y + b.y * r * ax * ca + n.y * r * ay * sa;
      pos[o + 2] = c.z + b.z * r * ax * ca + n.z * r * ay * sa;
      let nx = b.x * ca / ax + n.x * sa / ay, ny = b.y * ca / ax + n.y * sa / ay, nz = b.z * ca / ax + n.z * sa / ay;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
      o += 3;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.normal.needsUpdate = true;
}
const _sm = new M4(), _sx = new V3(), _sy = new V3(), _sz = new V3(), _sp = new V3(), _sc = new V3(), _st = new V3(), _sn = new V3(), _sb = new V3();
function updateSuckers(arm) {
  const p = arm.p;
  for (let m = 0; m < NS; m++) {
    const u = SUCKER_S[m] * (NJ - 1);
    const j = Math.min(NJ - 2, Math.floor(u)), f = u - j;
    _sc.lerpVectors(p[j], p[j + 1], f);
    _st.lerpVectors(arm.ft[j], arm.ft[j + 1], f).normalize();
    _sn.lerpVectors(arm.fn[j], arm.fn[j + 1], f);
    _sn.addScaledVector(_st, -_sn.dot(_st)).normalize();
    _sb.crossVectors(_st, _sn);
    const r = lerp(arm.rad[j], arm.rad[j + 1], f) / 0.92;
    const cw = lerp(arm.cw[j], arm.cw[j + 1], f);
    const side = (m & 1) ? 1 : -1;
    _sy.copy(_sn).addScaledVector(_sb, side * 0.42 * (1 - cw)).normalize();           // axis of the cup
    _sp.copy(_sc).addScaledVector(_sn, r * (0.80 + 0.10 * cw)).addScaledVector(_sb, side * r * 0.50 * (1 - 0.35 * cw));
    _sx.copy(_st).addScaledVector(_sy, -_st.dot(_sy)).normalize();
    _sz.crossVectors(_sx, _sy);
    const sr = r * 0.66 * (1 + 0.22 * cw), sh = r * 0.66 * (1 - 0.55 * cw) + 0.002;
    _sx.multiplyScalar(sr); _sy.multiplyScalar(sh); _sz.multiplyScalar(sr);
    _sm.makeBasis(_sx, _sy, _sz).setPosition(_sp);
    suckers.setMatrixAt(arm.i * NS + m, _sm);
  }
}
function updateArmsRender() {
  for (let i = 0; i < 8; i++) {
    computeFrames(arms[i]);
    updateArmMesh(arms[i], armMeshes[i]);
    updateSuckers(arms[i]);
  }
  suckers.instanceMatrix.needsUpdate = true;
}
function stepArms(dt, t) {
  const SUB = 2, h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    for (const a of arms) armBaseUpdate(a);
    for (const a of arms) stepArm(a, h, t);
  }
}
