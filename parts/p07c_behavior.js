
/* ---------- ESCAPE: arms hook the outside of the neck, the body is drawn up and squeezed
   through, vaults over the rim, slides down the glass and settles on the table.
   The body only advances while most arms are planted — pull, release, re-plant. ---------- */
const E_DIR = new V3(Math.cos(-0.53), 0, -Math.sin(-0.53));
const esc = { s: 0, started: false, pulse: 'plant', pt: 0, sFrom: 0, sTo: 0, phiE: -0.53, anchors: [], order: [], pulses: 0 };
const ESC_KEYS = [
  [0.00, 0.00, 2.12, 0.00], [0.20, 0.00, 3.02, 0.00], [0.36, 0.00, 3.80, 0.00], [0.48, 0.06, 4.52, 0.16],
  [0.60, 0.66, 4.85, 0.95], [0.72, 1.55, 4.15, 1.95], [0.84, 2.18, 2.80, 2.55], [0.93, 2.46, 1.52, 2.95],
  [1.00, 2.66, 0.74, Math.PI],
];
const _ek = { u: 0, y: 0, psi: 0 };
function escPath(s, out) {
  s = clamp(s, 0, 1);
  let k = 0;
  while (k < ESC_KEYS.length - 2 && s > ESC_KEYS[k + 1][0]) k++;
  const K = ESC_KEYS, a = K[k], b = K[k + 1];
  const h = b[0] - a[0], t = (s - a[0]) / h;
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const res = [0, 0, 0];
  for (let c = 1; c <= 3; c++) {
    const pm = k > 0 ? K[k - 1] : null, pn = k + 2 < K.length ? K[k + 2] : null;
    const m0 = pm ? (b[c] - pm[c]) / (b[0] - pm[0]) : (b[c] - a[c]) / h;
    const m1 = pn ? (pn[c] - a[c]) / (pn[0] - a[0]) : (b[c] - a[c]) / h;
    res[c - 1] = h00 * a[c] + h10 * h * m0 + h01 * b[c] + h11 * h * m1;
  }
  out.u = res[0]; out.y = res[1]; out.psi = res[2];
  return out;
}
const _escAxis = new V3(E_DIR.z, 0, -E_DIR.x);
function escPose(s) {
  escPath(s, _ek);
  body.escAxis.copy(_escAxis); body.escPsi = _ek.psi;
  body.postYaw = 0.78 * sstep(0.78, 1.0, s);
  setBodyPose(E_DIR.x * _ek.u, _ek.y, E_DIR.z * _ek.u, 0, 1);
}
const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
function escPlan(sNext) {
  escPath(sNext, _ek);
  const cu = _ek.u, cy = _ek.y;
  const order = arms.map(a => ({ a, rel: wrapPi(Math.atan2(-a.base.z, a.base.x) - esc.phiE) })).sort((x, y) => x.rel - y.rel);
  order.forEach((o, rank) => {
    const a = o.a, kk = rank - 3.5;
    const P = new V3(), N = new V3(), D = new V3();
    if (sNext < 0.46) {                      // the outside of the neck and the top of the rim
      const phi = esc.phiE + kk * 0.36;
      if (rank % 3 === 1) {
        polar(0.655, phi, JAR.rim, P); N.set(0, 1, 0); D.set(Math.cos(phi), 0, -Math.sin(phi));
      } else {
        const y = 3.14 + 0.09 * (rank & 1);
        polar(JAR.neckR, phi, y, P); N.set(Math.cos(phi), 0, -Math.sin(phi)); D.set(0, -1, 0);
      }
    } else if (sNext < 0.80) {               // the glass shoulder and flank, ahead and below the body
      const phi = esc.phiE + kk * 0.28;
      const y = clamp(cy - 0.95 - 0.28 * (rank % 3), 0.9, 3.05);
      jarOuterPoint(y, phi, P); jarOuterNormal(y, phi, N);
      D.set(0, -1, 0).addScaledVector(N, N.y); D.normalize();
    } else {                                 // the table, all around where it will sit
      const ang = kk * 0.85 + esc.phiE * 0.0;
      const r = 0.85 + 0.3 * (rank % 3);
      const cx = E_DIR.x * 2.66, cz = E_DIR.z * 2.66;
      P.set(cx + Math.cos(ang + 0.6) * r, 0, cz - Math.sin(ang + 0.6) * r * 1.0);
      const rr = Math.hypot(P.x, P.z);
      if (rr < JAR.R + 0.16) { P.x *= (JAR.R + 0.16) / rr; P.z *= (JAR.R + 0.16) / rr; }
      N.set(0, 1, 0); D.set(P.x - cx, 0, P.z - cz).normalize();
    }
    esc.anchors[a.i] = { P, N, D };
  });
}
const PLANT_T = 0.62, PULL_T = 1.05, REL_T = 0.26;
function escDs(s) { return s < 0.46 ? 0.085 : 0.115; }
function startEscape() {
  setPhase('escape');
  esc.s = 0; esc.pulse = 'plant'; esc.pt = 0; esc.pulses = 0; esc.started = true;
  body.escPsi = 0;
  escPlan(escDs(0));
  sim.subLabel = 'pulling through the neck';
}
function updateEscape(dt) {
  const t = sim.t;
  esc.pt += dt;
  let g = 0, lift = 0;
  if (esc.pulse === 'plant') {
    const k = clamp(esc.pt / PLANT_T, 0, 1);
    lift = 0.40 * (1 - easeOut(k)); g = sstep(0.65, 1, k);
    if (esc.pt >= PLANT_T) { esc.pulse = 'pull'; esc.pt = 0; esc.sFrom = esc.s; esc.sTo = Math.min(1, esc.s + escDs(esc.s)); }
  } else if (esc.pulse === 'pull') {
    const k = clamp(esc.pt / PULL_T, 0, 1);
    esc.s = lerp(esc.sFrom, esc.sTo, ease(k)); g = 1; lift = 0;
    if (k >= 1) {
      if (esc.s >= 0.999) { esc.s = 1; finishEscape(); return; }
      esc.pulse = 'release'; esc.pt = 0;
    }
  } else {
    const k = clamp(esc.pt / REL_T, 0, 1);
    g = 1 - k; lift = 0.40 * easeOut(k);
    if (esc.pt >= REL_T) { esc.pulse = 'plant'; esc.pt = 0; esc.pulses++; escPlan(esc.s + escDs(esc.s)); }
  }
  escPose(esc.s);
  for (const a of arms) a.smooth = 0.04;
  const pullK = esc.pulse === 'pull' ? 1 : 0;
  body.sy = 1 + 0.16 * Math.exp(-Math.pow((esc.s - 0.34) / 0.14, 2)) + 0.02 * Math.sin(t * 1.9);
  body.breath = Math.sin(t * 2.6) * 0.5 + 0.6 * pullK;
  body.lookAt.copy(camera.position);
  sim.flush = dampTo(sim.flush, 0.45 + 0.4 * pullK, 3, dt);
  for (const a of arms) {
    const an = esc.anchors[a.i];
    _p1.copy(an.P).addScaledVector(an.N, lift);
    armTarget(a, _p1, an.N, an.D, lerp(0.9, 1, g), g, 3);
    a.acc.set(0, -0.5, 0); a.wave.amp = 1.5; a.wave.axis.set(0, 0, 1); a.damp = 0.88;
    a.tremor = pullK * 0.6;
  }
  sim.subLabel = esc.s < 0.46 ? 'hooked on the rim, pulling through the neck' : esc.s < 0.8 ? 'vaulting over the glass' : 'sliding down to the table';
  PHASE_INFO.escape[1] = sim.subLabel;
  uiLastSub = '';
  // squeezing through: little bursts of trapped air
  if (esc.s > 0.14 && esc.s < 0.5 && rand() < dt * 9) {
    burstBubbles(_p5.set((rand() - 0.5) * 0.5, Math.min(body.pos.y + 0.5, 3.3), (rand() - 0.5) * 0.5), 1, 0.2);
  }
}
function finishEscape() {
  setPhase('free');
  for (const a of arms) armRelease(a);
  sim.doneT = 0;
}

/* ---------- FREE: on the table, looking back at the camera ---------- */
function updateFree(dt) {
  const t = sim.t;
  escPose(1);
  body.escPsi = Math.PI;
  body.postYaw = 0.78;
  body.sy = 1 + 0.02 * Math.sin(t * 1.7);
  body.breath = Math.sin(t * 1.7);
  body.lookAt.copy(camera.position);
  sim.flush = dampTo(sim.flush, 0.02, 1.2, dt);
  for (const a of arms) {
    _p1.set(Math.cos(a.ang), 0, Math.sin(a.ang)).applyQuaternion(body.quat); _p1.y = 0; _p1.normalize();
    _p2.set(-_p1.z, 0, _p1.x);
    const Rh = 0.95 + 0.14 * Math.sin(t * 0.5 + a.i * 1.3), curl = 0.55 + 0.3 * Math.sin(t * 0.33 + a.i * 0.8);
    _p3.set(body.pos.x, 0.11, body.pos.z).addScaledVector(_p1, Rh).addScaledVector(_p2, curl);
    _p4.copy(_p2).multiplyScalar(0.6).y = 0.6;
    armDrift(a, _p3, 0.06, 1.8, 3.5, _p4.normalize());
    a.tremor = 0; a.damp = 0.9;
  }
  sim.doneT += dt;
  if (sim.doneT > 7.5 && !sim.fading && $('loop').checked) queueReset(true);
}

/* ---------- reset / loop with a fade through black ---------- */
function queueReset(slow) {
  if (sim.fading) return;
  sim.fading = true;
  const f = $('fade');
  f.style.transitionDuration = slow ? '1.1s' : '0.35s';
  f.style.opacity = 1;
  setTimeout(() => {
    simReset();
    setTimeout(() => { f.style.opacity = 0; sim.fading = false; }, 120);
  }, slow ? 1150 : 380);
}

/* ---------- the whole simulation, one step ---------- */
function simUpdate(dt) {
  sim.t += dt; sim.pt += dt;
  switch (sim.phase) {
    case 'idle': updateIdle(dt); break;
    case 'explore': updateExplore(dt); break;
    case 'unscrew': updateUnscrew(dt); break;
    case 'drop': updateDrop(dt); break;
    case 'escape': updateEscape(dt); break;
    case 'free': updateFree(dt); break;
  }
  if (lid.mode === 'free' && !lid.settled) stepLidFree(dt);
  updateMantle();
  updateEyes(dt);
  stepArms(dt, sim.t);
  updateArmsRender();
  skinFlush.value = sim.flush;
  const xr = sim.xray && lid.mode === 'thread' && ((sim.phase === 'explore' && sim.pt > 3.4) || sim.phase === 'unscrew');
  ghostU.uOpacity.value = dampTo(ghostU.uOpacity.value, xr ? 1 : 0, 3, dt);
  const gv = ghostU.uOpacity.value > 0.01;
  for (const m of ghostMeshes) m.visible = gv;
  // bubbles trickle up from the octopus while it is underwater
  if (body.pos.y < 3.0 && Math.hypot(body.pos.x, body.pos.z) < 0.6 && rand() < dt * 1.2) {
    burstBubbles(_p5.set(body.pos.x, body.pos.y + 0.4, body.pos.z), 1, 0.6);
  }
  U.thud.value = Math.max(0, U.thud.value - dt * 1.8);
}
