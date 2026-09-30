if (location.search.includes('dbg')) {
  window.__d = { quality, perf, tableMat, keyLight, bokeh, glassLayers, sim, body, arms, lid, esc, orbit, camera, scene, U, setPhase, startUnscrew, startDrop, startEscape, simStep, simReset, renderer, WORK_ARMS, HOME_PHI };
  window.__skip = (sec, phase) => { if (phase) { while (sim.phase !== phase && sim.t < 400) simStep(1 / 60); } else { for (let t = 0; t < sec; t += 1 / 60) simStep(1 / 60); } };
}
