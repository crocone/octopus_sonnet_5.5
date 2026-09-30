
/* ---------- UNSCREW: grip → turn → release → re-grip, two groups in alternation.
   The lid's rotation is an integral of the torque the gripping suckers apply:
   tau_i = K · rho² · (desired sweep − actual lid rotation since grip)
   and the thread resists with a static friction threshold (a stiff first "seal"). ---------- */
const UC = { Tc: 2.1, land: 0.28, pull: 0.92, rel: 0.22, ret: 0.68, sweep: 1.5, K: 10, seal: 3.0, sealAngle: 0.55, thread: 1.1, C: 2.4, hover: 0.28 };
function startUnscrew() {
  setPhase('unscrew');
  for (const i of WORK_ARMS) {
    const a = arms[i];
    a.ex = null;
    a.u = { grp: GROUP_OF[i], rho: (i & 1) ? 0.47 : 0.39, home: HOME_PHI[i], state: '', thGrip: 0, phiL: 0, phiEnd: 0, g: 0, e: 0 };
  }
  sim.strokes = 0; sim.sealBroken = false;
}
function armContact(a, phiW, rho, lift, g, w) {
  polar(rho, phiW, lidUnderY(), _p1);
  _p2.set(0, -1, 0);
  _p3.set(-Math.sin(phiW), 0, -Math.cos(phiW));
  _p1.addScaledVector(_p2, lift);
  armTarget(a, _p1, _p2, _p3, w, g, 3);
}
function updateUnscrew(dt) {
  const t = sim.t, U_ = UC;
  sim.cycleClock += dt;
  let tauSum = 0, pulling = 0, releasing = 0, landing = 0;
  for (const i of WORK_ARMS) {
    const a = arms[i], u = a.u;
    let tc = sim.cycleClock - (u.grp ? U_.Tc * 0.5 : 0);
    if (tc < 0) {                       // second group still waiting at home, hovering
      armContact(a, u.home, u.rho, U_.hover, 0, 0.8); u.state = 'wait'; a.tremor = 0; continue;
    }
    tc = tc % U_.Tc;
    let state, phi = u.home, lift = 0, g = 0, e = 0;
    const t1 = U_.land, t2 = t1 + U_.pull, t3 = t2 + U_.rel;
    if (tc < t1) {
      state = 'land'; const k = tc / t1;
      lift = U_.hover * (1 - easeOut(k)); g = sstep(0.55, 1, k) * 0.7;
      phi = u.home; landing++;
    } else if (tc < t2) {
      state = 'pull'; const k = (tc - t1) / U_.pull;
      if (u.state !== 'pull') { u.thGrip = lid.theta; u.phiL = u.home - lid.theta; }
      phi = u.phiL + lid.theta; g = Math.min(1, (tc - t1) / 0.10) * 1;
      e = U_.sweep * ease(k) - (lid.theta - u.thGrip);
      pulling++;
    } else if (tc < t3) {
      state = 'release'; const k = (tc - t2) / U_.rel;
      if (u.state !== 'release') u.phiEnd = u.phiL + lid.theta;
      phi = u.phiEnd; lift = U_.hover * easeOut(k); g = Math.max(0, 1 - (tc - t2) / 0.11);
      e = U_.sweep - (lid.theta - u.thGrip);
      releasing++;
    } else {
      state = 'return'; const k = (tc - t3) / U_.ret;
      if (u.state !== 'return') u.phiEnd = u.phiL + lid.theta;
      phi = lerp(u.phiEnd, u.home, ease(k)); lift = U_.hover; g = 0;
    }
    if (i === WORK_ARMS[0] && u.state !== 'land' && state === 'land') sim.strokes++;
    u.state = state; u.g = g; u.e = e;
    if (g > 0.9 && e > 0) tauSum += U_.K * u.rho * u.rho * e * g;
    armContact(a, phi, u.rho, lift, g, lerp(0.88, 1, g));
    a.acc.set(0, -0.2, 0); a.wave.amp = state === 'return' ? 2.0 : 0.6; a.wave.axis.set(0, 0, 1);
    a.damp = 0.87;
  }
  // the thread: a static seal at first, then sliding friction
  const fr = lid.theta < U_.sealAngle ? U_.seal : U_.thread;
  const target = tauSum > fr ? (tauSum - fr) / U_.C : 0;
  lid.omega = dampTo(lid.omega, target, 16, dt);
  lid.theta += lid.omega * dt;
  lidPlaceThreaded();
  const straining = pulling > 0 && tauSum > 0.4 * fr && lid.omega < 0.1;
  sim.strain = dampTo(sim.strain, straining ? 1 : 0, 10, dt);
  for (const i of WORK_ARMS) arms[i].tremor = (arms[i].u.state === 'pull' ? 1 : 0) * sim.strain;
  if (!sim.sealBroken && lid.theta > U_.sealAngle) {
    sim.sealBroken = true;
    burstBubbles(_p5.set(0, 3.15, 0), 12, 0.7); orbit.shake = Math.max(orbit.shake, 0.004);
  }
  if (lid.omega > 0.6 && rand() < dt * 6) burstBubbles(_p5.set((rand() - 0.5) * 0.7, 3.1, (rand() - 0.5) * 0.7), 1, 0.2);

  // bracing arms hold the glass; the body counter-twists a touch
  for (const i of ANCHOR_ARMS) {
    const a = arms[i];
    armWallAnchor(a, i === 0 ? Math.PI : 0, 1.95 + 0.05 * i, 1, 1);
    a.acc.set(0, -0.2, 0); a.wave.amp = 0; a.tremor = sim.strain * 0.6;
  }
  body.yaw = dampTo(body.yaw, -0.10 * clamp(lid.omega, 0, 2), 3, dt);
  setBodyPose(Math.sin(t * 0.31) * 0.03, WORK_Y + Math.sin(t * 0.8) * 0.02, Math.cos(t * 0.27) * 0.03, body.yaw, 1);
  body.sy = 1 + 0.02 * Math.sin(t * 1.9) + 0.015 * sim.strain * Math.sin(t * 40);
  body.breath = Math.sin(t * 1.9) * 0.5;
  body.lookAt.set(0.0, 3.6, 0.2);
  sim.flush = dampTo(sim.flush, 0.25 + clamp(tauSum / 6, 0, 1) * 0.75, 4, dt);
  sim.subLabel = pulling ? 'grip · turn' + ' — stroke ' + Math.max(1, sim.strokes) :
    releasing ? 'release · peel off' : landing ? 're-grip · suckers seal' : 'repositioning';
  if (sim.strain > 0.5 && pulling) sim.subLabel = 'straining against the seal';
  if (lid.h >= LID.Hfree) startDrop();
}

/* ---------- DROP: the thread lets go; the cap tips off the rim and falls ---------- */
const LID_DIR = new V3(-0.96, 0, 0.14).normalize();
function startDrop() {
  lidRelease(LID_DIR);
  setPhase('drop');
  for (const i of WORK_ARMS) { arms[i].u = null; armRelease(arms[i]); }
  burstBubbles(_p5.set(0, 3.2, 0), 16, 0.8);
  orbit.shake = Math.max(orbit.shake, 0.006);
}
function updateDrop(dt) {
  const t = sim.t, pt = sim.pt;
  body.yaw = dampTo(body.yaw, 0, 3, dt);
  setBodyPose(Math.sin(t * 0.31) * 0.03, WORK_Y + 0.22 * sstep(0.3, 2.4, pt), Math.cos(t * 0.27) * 0.03, body.yaw, 1);
  body.lookAt.copy(lid.pos);
  body.breath = Math.sin(t * 2.4) * 0.6;
  sim.flush = dampTo(sim.flush, 0.1, 2, dt);
  for (const a of arms) {
    a.tremor = 0; a.wave.amp = 2.5; a.wave.axis.set(1, 0, 0.3).normalize(); a.damp = 0.80; a.smooth = 0.02;
    armAnchorPrev(a);
    // tentacles start feeling their way up and out of the neck
    polar(0.26, (a.i / 8) * TAU + t * 0.4, JAR.rim + 0.55 + 0.25 * Math.sin(t * 1.6 + a.i), _p2);
    armDrift(a, _p2, 0.10 * sstep(1.0, 2.4, pt), 0.15, 2.5, _p3.set(1, 0, 0.3));
  }
  if (pt > 2.3 && (lid.settled || pt > 3.6)) startEscape();
}
function armAnchorPrev(a) {
  if (a.i === 0 || a.i === 4) armRelease(a);
}
