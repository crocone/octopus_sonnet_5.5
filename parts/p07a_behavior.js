
/* ======================================================================
   BEHAVIOUR — idle → explore → unscrew (torque-driven) → lid falls → escape
   ====================================================================== */
const REST_Y = 0.70, WORK_Y = 2.12;
const sim = {
  t: 0, phase: 'idle', pt: 0, paused: false, flush: 0,
  cycleClock: 0, strain: 0, gripCount: 0, xray: true, subLabel: '', resetQueued: 0, fading: false, doneT: 0,
};
const PHASE_INFO = {
  idle: ['Idle', 'resting on the bottom, breathing', 0],
  explore: ['Exploring', 'rising, reaching for the lid', 1],
  unscrew: ['Unscrewing', '', 2],
  drop: ['Lid free', 'the cap tips off the thread', 2],
  escape: ['Escaping', 'pulling through the neck', 3],
  free: ['Free', 'out on the table', 4],
};
const uiPhase = $('phase'), uiSub = $('sub'), uiRot = $('rot'), uiHgt = $('hgt'), uiBar = $('bar');
const uiSteps = [...$('steps').children];
let uiLastPhase = '', uiLastSub = '';
function setPhase(ph) {
  sim.phase = ph; sim.pt = 0;
  if (ph === 'unscrew') { sim.cycleClock = 0; }
}
function updateUI() {
  const info = PHASE_INFO[sim.phase];
  if (uiLastPhase !== sim.phase) {
    uiLastPhase = sim.phase;
    uiPhase.textContent = info[0];
    uiPhase.style.color = sim.phase === 'free' ? '#7fe3cf' : '';
    uiSteps.forEach((s, i) => { s.className = i < info[2] ? 'on' : i === info[2] ? 'cur' : ''; });
  }
  const sub = sim.phase === 'unscrew' ? sim.subLabel : info[1];
  if (sub !== uiLastSub) { uiLastSub = sub; uiSub.textContent = sub; }
  const deg = lid.theta * 180 / Math.PI;
  const hmm = lid.mesh.position.y * MM;
  uiRot.innerHTML = Math.round(deg) + '<i>°</i>';
  uiHgt.innerHTML = hmm.toFixed(1) + '<i>mm</i>';
  uiBar.style.width = (clamp(lid.theta / (LID.turns * TAU), 0, 1) * 100).toFixed(1) + '%';
}

/* CCW-from-above polar helper: increasing phi turns counter-clockwise seen from above */
const polar = (rho, phi, y, out) => out.set(rho * Math.cos(phi), y, -rho * Math.sin(phi));
const _p1 = new V3(), _p2 = new V3(), _p3 = new V3(), _p4 = new V3(), _p5 = new V3();
const _Nd = new V3(0, -1, 0);

function setBodyPose(x, y, z, yaw, flip) {
  body.pos.set(x, y, z);
  _qa.setFromAxisAngle(_Y, yaw);
  _qb.setFromAxisAngle(_Z_AXIS, Math.PI * flip);
  body.quat.copy(_qa).multiply(_qb);
  if (body.escPsi) {
    _qc.setFromAxisAngle(body.escAxis, body.escPsi);
    body.quat.premultiply(_qc);
  }
  if (body.postYaw) {
    _qc.setFromAxisAngle(_Y, body.postYaw);
    body.quat.premultiply(_qc);
  }
}
const _Z_AXIS = new V3(0, 0, 1), _qc = new Q();
body.escPsi = 0; body.escAxis = new V3(1, 0, 0); body.postYaw = 0;

/* a soft free-space waving target for trailing / resting arms */
function armDrift(arm, P, w, gravity, amp, axis) {
  armFree(arm, P, w);
  arm.tgt.on = false;
  arm.acc.set(0, -gravity, 0);
  arm.wave.amp = amp; arm.wave.axis.copy(axis);
}

/* ---------- reset: a brand new jar ---------- */
function simReset() {
  sim.t = 0; sim.phase = 'idle'; sim.pt = 0; sim.flush = 0; sim.cycleClock = 0; sim.strain = 0;
  sim.doneT = 0; sim.fading = false; sim.subLabel = '';
  lidResetPose();
  skinFlush.value = 0;
  body.squeezeOn = 1; body.flip = 0; body.yaw = 0; body.sy = 1; body.breath = 0; body.escPsi = 0; body.postYaw = 0;
  setBodyPose(0, REST_Y, 0, 0.2, 0);
  for (const a of arms) {
    a.ex = null; a.u = null; a.esc = null; a.tremor = 0; a.damp = 0.90; a.maxBend = 0.78; a.smooth = 0.05;
    armReset(a, JAR.floor);
  }
  for (let k = 0; k < 10; k++) { updateMantle(); stepArms(1 / 60, k / 60); }
  for (let i = 0; i < MAXB; i++) bub.life[i] = 0;
  esc.s = 0; esc.started = false;
  orbit.tTarget.set(0.35, 1.7, 0);
  updateArmsRender();
}

/* ---------- IDLE ---------- */
function updateIdle(dt) {
  const t = sim.t;
  const yaw = 0.25 * Math.sin(t * 0.11) + 0.2;
  setBodyPose(Math.sin(t * 0.23) * 0.03, REST_Y + 0.012 * Math.sin(t * 0.9), Math.cos(t * 0.19) * 0.03, yaw, 0);
  body.breath = Math.sin(t * 1.9);
  body.sy = 1 + 0.018 * body.breath;
  body.lookAt.copy(camera.position);
  sim.flush = dampTo(sim.flush, 0.0, 2, dt);
  for (const a of arms) {
    _p1.set(Math.cos(a.ang), 0, Math.sin(a.ang)).applyQuaternion(body.quat); _p1.y = 0; _p1.normalize();   // outward
    _p2.set(-_p1.z, 0, _p1.x);                                                                               // sideways (curl)
    const Rh = 0.88 + 0.12 * Math.sin(t * 0.37 + a.i * 1.3);
    const curl = 0.55 + 0.25 * Math.sin(t * 0.29 + a.i * 0.8);
    _p3.set(body.pos.x, JAR.floor + 0.10, body.pos.z).addScaledVector(_p1, Rh).addScaledVector(_p2, curl);
    const lim = JAR.Rin - 0.14, rr = Math.hypot(_p3.x, _p3.z);
    if (rr > lim) { _p3.x *= lim / rr; _p3.z *= lim / rr; }
    _p4.copy(_p2).multiplyScalar(0.6).y = 0.6;
    armDrift(a, _p3, 0.05 + 0.03 * Math.sin(t * 0.7 + a.i), 1.6, 3.5 + 1.2 * Math.sin(a.i), _p4.normalize());
    a.tremor = 0;
  }
  if (Math.random() < dt * 0.25) burstBubbles(_p3.set(body.pos.x, 0.3, body.pos.z), 1, 0.6);
  if (sim.pt > 4.6) setPhase('explore');
}

/* ---------- EXPLORE ---------- */
const WORK_ARMS = [1, 2, 3, 5, 6, 7], ANCHOR_ARMS = [0, 4];
const GROUP_OF = { 1: 0, 3: 0, 6: 0, 2: 1, 5: 1, 7: 1 };
const HOME_PHI = {};   // world CCW angle where each working arm lands (set while exploring)
const T_RISE = 2.8, T_FLIP0 = 1.7, T_FLIP1 = 5.2, T_PROBE = 4.3, T_EXPLORE = 11.6;

function armWallAnchor(arm, phi, y, w, g) {
  polar(rInAt(y), phi, y, _p1);
  _p2.set(-Math.cos(phi), 0, Math.sin(phi));       // inward normal
  _p3.set(0, 1, 0);
  armTarget(arm, _p1, _p2, _p3, w, g, 3);
}
function exploreProbe(arm, dt) {
  const ex = arm.ex;
  ex.t += dt;
  if (ex.t < 0) return false;
  const LC = 2.35;
  if (ex.t >= LC || !ex.cur) {
    ex.t = ex.t >= LC ? ex.t - LC : 0;
    const k = rand();
    ex.cur = { kind: k < 0.62 ? 'lid' : 'rim', rho: 0.14 + rand() * 0.34, phi: rand() * TAU };
    if (ex.cur.kind === 'rim') ex.cur.phi = HOME_PHI[arm.i] + (rand() - 0.5) * 1.4;
  }
  const c = ex.cur, tt = ex.t;
  const lift = tt < 0.95 ? lerp(0.75, 0.22, easeOut(tt / 0.95)) : tt < 1.3 ? lerp(0.22, 0.0, (tt - 0.95) / 0.35) : tt < 1.95 ? 0 : lerp(0, 0.4, (tt - 1.95) / 0.4);
  const g = tt < 1.0 ? 0 : tt < 1.3 ? (tt - 1.0) / 0.3 * 0.8 : tt < 1.95 ? 0.8 : Math.max(0, 0.8 - (tt - 1.95) * 4);
  if (c.kind === 'lid') {
    polar(c.rho, c.phi, LID.under, _p1); lidLocalToWorld(_p1, _p2);
    _p3.set(0, -1, 0).applyQuaternion(lid.mesh.quaternion);
    _p4.set(-Math.sin(c.phi), 0, -Math.cos(c.phi)).applyQuaternion(lid.mesh.quaternion);
    _p2.addScaledVector(_p3, lift);
    armTarget(arm, _p2, _p3, _p4, 0.9, g, 3);
    _p2.addScaledVector(_p3, -lift);
  } else {
    const y = 3.22 - lift * 0.25;
    polar(JAR.neckIn, c.phi, y, _p1);
    _p2.set(-Math.cos(c.phi), 0, Math.sin(c.phi));
    _p1.addScaledVector(_p2, lift * 0.6);
    _p3.set(0, -1, 0);
    armTarget(arm, _p1, _p2, _p3, 0.9, g, 3);
  }
  return true;
}
const _ow = new V3();
function updateExplore(dt) {
  const pt = sim.pt, t = sim.t;
  // the body: two jet pulses up, a roll that puts the arms on top, then it floats under the lid
  const rise = ease(clamp(pt / T_RISE, 0, 1));
  const y1 = lerp(REST_Y, 1.55, rise);
  const y = lerp(y1, WORK_Y, ease(clamp((pt - 2.0) / 3.4, 0, 1)));
  const flip = ease(clamp((pt - T_FLIP0) / (T_FLIP1 - T_FLIP0), 0, 1));
  const jet = pt < 3.4 ? Math.pow(Math.max(0, Math.sin(pt * 2.6 - 0.3)), 2) : 0;
  body.sy = 1 + 0.10 * jet + 0.018 * Math.sin(t * 1.9);
  body.breath = jet * 1.4 + Math.sin(t * 1.9) * 0.3;
  const sway = sstep(3.5, 6, pt);
  setBodyPose(Math.sin(t * 0.31) * 0.06 * sway, y + Math.sin(t * 0.8) * 0.02, Math.cos(t * 0.27) * 0.05 * sway,
    lerp(0.2, 0.0, flip), flip);
  body.flip = flip;
  if (jet > 0.85 && rand() < dt * 10) { bodyToWorld(_p5.set(0, -0.35, 0.5), _p4); burstBubbles(_p4, 2, 0.25); }
  body.lookAt.copy(pt < 5 ? camera.position : _p5.set(0.2, 3.3, 0.1));
  sim.flush = dampTo(sim.flush, 0.25 + 0.15 * Math.sin(t * 2), 1.5, dt);

  // arms
  for (const a of arms) {
    _ow.set(Math.cos(a.ang), 0, Math.sin(a.ang)).applyQuaternion(body.quat);
    const phiBase = Math.atan2(-_ow.z, _ow.x);
    if (WORK_ARMS.includes(a.i)) {
      if (!a.ex) { a.ex = { t: -(0.3 + WORK_ARMS.indexOf(a.i) * 0.42), cur: null }; }
      HOME_PHI[a.i] = phiBase;
      if (pt > T_PROBE && exploreProbe(a, dt)) {
        a.acc.set(0, -0.3, 0); a.wave.amp = 1.5; a.wave.axis.set(0, 0, 1); a.damp = 0.88;
      } else {
        a.tgt.on = false;
        // trail under / beside the body while it climbs
        _p2.copy(body.pos).addScaledVector(_ow.set(_ow.x, 0, _ow.z).normalize(), 0.55).y -= 0.95 - 0.35 * flip;
        _p3.set(-_ow.z, 0.3, _ow.x).normalize();
        armDrift(a, _p2, 0.06, 0.5, 4.5, _p3);
        if (pt > T_FLIP0 + 1.3) { // arms swing up as the body turns over
          _p2.copy(body.pos); _p2.y += 0.9 + 0.8 * flip; _p2.x += _ow.x * 0.4; _p2.z += _ow.z * 0.4;
          armFree(a, _p2, 0.18 * sstep(T_FLIP0 + 1.3, T_PROBE, pt));
        }
      }
    } else {
      // the two bracing arms find the glass and hold on
      const phi = a.i === 0 ? Math.PI : 0;
      const k = sstep(2.4, 4.4, pt);
      if (k > 0.001) {
        armWallAnchor(a, phi, clamp(body.pos.y + 0.15, 0.6, 2.2), 0.25 + 0.7 * k, k);
        a.acc.set(0, -0.3, 0); a.wave.amp = 0;
      } else {
        _p2.copy(body.pos).addScaledVector(_ow.set(_ow.x, 0, _ow.z).normalize(), 0.6).y -= 0.7;
        armDrift(a, _p2, 0.05, 0.6, 3.5, _p3.set(0, 0, 1));
      }
    }
  }
  if (pt > T_EXPLORE) {
    startUnscrew();
  }
}
