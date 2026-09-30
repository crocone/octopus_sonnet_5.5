
/* ======================================================================
   MAIN LOOP — two passes: (1) the scene without glass/water into a
   half-float target, (2) the full scene where the water shell samples it
   through a per-channel refraction. Shadows are rendered once per frame.
   ====================================================================== */
function renderFrame() {
  U.viewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  U.lampView.value.copy(LAMP).applyMatrix4(camera.matrixWorldInverse);
  renderer.shadowMap.needsUpdate = true;
  for (const m of glassLayers) m.visible = false;
  bubbles.visible = false;
  const ghostWas = ghostMeshes[0].visible;
  for (const m of ghostMeshes) m.visible = false;
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  for (const m of glassLayers) m.visible = true;
  bubbles.visible = true;
  for (const m of ghostMeshes) m.visible = ghostWas;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}

function simStep(dt) {
  const n = Math.max(1, Math.ceil(dt / 0.02));
  for (let i = 0; i < n; i++) simUpdate(dt / n);
  U.time.value += dt;
  updateBubbles(dt, U.time.value);
  updateDust(U.time.value, dt);
}
const camTargets = { idle: [0.35, 1.7, 0], explore: [0.35, 1.8, 0], unscrew: [0.3, 2.0, 0], drop: [0.0, 1.9, 0.3], escape: [1.0, 1.9, 0.3], free: [1.0, 1.6, 0.4] };

/* adaptive resolution: hold ~60 fps on modest GPUs by trading pixel ratio */
const perf = { acc: 0, n: 0, frames: 0, calm: 0 };
function perfTick(rawMs) {
  if (rawMs > 120 || ++perf.frames < 90) return;
  perf.acc += rawMs; perf.n++;
  if (perf.n < 45) return;
  const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
  if (avg > 21 && quality.scale > 0.56) { quality.scale = Math.max(0.56, quality.scale * 0.86); perf.calm = 0; resize(); }
  else if (avg < 14 && quality.scale < 1 && ++perf.calm > 4) { quality.scale = Math.min(1, quality.scale * 1.08); perf.calm = 0; resize(); }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  perfTick(now - last);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!sim.paused) simStep(dt);
  const ct = camTargets[sim.phase]; orbit.tTarget.set(ct[0], ct[1], ct[2]);
  if (sim.phase === 'escape') {
    const k = Math.sin(Math.PI * clamp((esc.s - 0.1) / 0.75, 0, 1));
    orbit.tTarget.set(0.35 + 0.8 * esc.s, 1.9 + 0.95 * k, 0.3);
  }
  for (const sp of bokeh) sp.material.opacity = sp.userData.o * (0.72 + 0.28 * Math.sin(U.time.value * sp.userData.sp + sp.userData.ph));
  updateCamera(dt);
  updateUI();
  renderFrame();
}

/* ---------- controls ---------- */
function setPaused(p) {
  sim.paused = p;
  $('pauseLbl').textContent = p ? 'Resume' : 'Pause';
}
$('btnPause').addEventListener('click', e => { setPaused(!sim.paused); e.currentTarget.blur(); });
$('btnReset').addEventListener('click', e => { setPaused(false); queueReset(false); e.currentTarget.blur(); });
function setXray(on) { sim.xray = on; $('btnXray').setAttribute('aria-pressed', on ? 'true' : 'false'); }
$('btnXray').addEventListener('click', e => { setXray(!sim.xray); e.currentTarget.blur(); });
window.addEventListener('keydown', e => {
  if (e.code === 'KeyX') setXray(!sim.xray);
  if (e.code === 'Space') { e.preventDefault(); setPaused(!sim.paused); }
  else if (e.code === 'KeyR') { setPaused(false); queueReset(false); }
});
document.addEventListener('visibilitychange', () => { last = performance.now(); });

/* ---------- go: compile every shader variant behind the loading card, then start ---------- */
async function warmUp() {
  simReset();
  updateArmsRender();
  camera.updateMatrixWorld();
  for (const m of ghostMeshes) m.visible = true;
  ghostU.uOpacity.value = 0;
  const comp = async () => {
    if (renderer.compileAsync) { try { await renderer.compileAsync(scene, camera); return; } catch (e) { /* fall through */ } }
    renderer.compile(scene, camera);
  };
  renderer.setRenderTarget(rt); await comp();
  renderer.setRenderTarget(null); await comp();
  renderFrame();
  for (const m of ghostMeshes) m.visible = false;
}
warmUp().then(() => {
  requestAnimationFrame(t => { last = t; frame(t); });
  setTimeout(() => {
    const l = $('loading'); l.style.opacity = 0; setTimeout(() => l.style.display = 'none', 900);
  }, 250);
});
