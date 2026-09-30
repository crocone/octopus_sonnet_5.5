
/* TEMP TEST LOOP */
function renderFrame() {
  U.viewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  renderer.shadowMap.needsUpdate = true;
  for (const m of glassLayers) m.visible = false;
  bubbles.visible = false;
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  for (const m of glassLayers) m.visible = true;
  bubbles.visible = true;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}
lidPlaceThreaded();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  U.time.value += dt;
  updateCamera(dt);
  updateBubbles(dt, U.time.value);
  if (Math.random() < 0.05) emitBubble((Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.03, 0.3);
  renderFrame();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
$('loading').style.opacity = 0;
setTimeout(() => $('loading').style.display = 'none', 900);
window.__d = { glassLayers, water, U, camera, orbit, scene, renderer, bubbles, lid, tableMat, keyLight };
