
/* ======================================================================
   THE LID — knurled brass screw cap. Threaded motion while engaged,
   a small rigid-body solver once it comes free.
   ====================================================================== */
function makeLidTextures() {
  const S = 512;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const cc = mk(), rc = mk();
  const g = cc.getContext('2d'), gr = rc.getContext('2d');
  const R = 0.82, px = r => r / R * (S / 2);
  g.fillStyle = '#b48545'; g.fillRect(0, 0, S, S);
  gr.fillStyle = 'rgb(92,92,92)'; gr.fillRect(0, 0, S, S);
  const br = mulberry(5);
  // concentric brushed lines
  for (let i = 0; i < 2600; i++) {
    const r = br() * S * 0.5, a0 = br() * TAU, len = 0.3 + br() * 1.6;
    const l = br() > 0.5;
    g.strokeStyle = l ? `rgba(255,228,170,${0.03 + br() * 0.07})` : `rgba(50,28,8,${0.04 + br() * 0.08})`;
    g.lineWidth = 0.5 + br() * 1.2;
    g.beginPath(); g.arc(S / 2, S / 2, r, a0, a0 + len); g.stroke();
    gr.strokeStyle = l ? 'rgba(70,70,70,0.12)' : 'rgba(150,150,150,0.12)';
    gr.lineWidth = g.lineWidth; gr.beginPath(); gr.arc(S / 2, S / 2, r, a0, a0 + len); gr.stroke();
  }
  // embossed ring
  const ring = (ctx, r0, r1, col) => { ctx.strokeStyle = col; ctx.lineWidth = px(r1) - px(r0); ctx.beginPath(); ctx.arc(S / 2, S / 2, (px(r0) + px(r1)) / 2, 0, TAU); ctx.stroke(); };
  ring(g, 0.425, 0.52, 'rgba(255,235,185,0.22)');
  ring(g, 0.44, 0.50, 'rgba(255,235,185,0.12)');
  ring(g, 0.52, 0.535, 'rgba(40,20,4,0.5)');
  ring(g, 0.41, 0.425, 'rgba(40,20,4,0.4)');
  // a bold counter-clockwise arrow and a tick at the rim, so the turning reads from far away
  g.save(); g.translate(S / 2, S / 2);
  g.strokeStyle = 'rgba(48,26,6,0.85)'; g.lineWidth = 9; g.lineCap = 'round';
  const ar = px(0.28);
  g.beginPath(); g.arc(0, 0, ar, -2.6, 0.55); g.stroke();
  g.beginPath(); g.moveTo(Math.cos(0.55) * ar + 2, Math.sin(0.55) * ar - 4);
  g.lineTo(Math.cos(0.55) * ar + 25, Math.sin(0.55) * ar - 18);
  g.moveTo(Math.cos(0.55) * ar + 2, Math.sin(0.55) * ar - 4);
  g.lineTo(Math.cos(0.55) * ar - 8, Math.sin(0.55) * ar + 24); g.stroke();
  g.strokeStyle = 'rgba(255,235,190,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, ar + 6, -2.6, 0.55); g.stroke();
  g.fillStyle = 'rgba(40,20,4,0.9)';
  g.beginPath(); g.arc(0, -px(0.675), 9, 0, TAU); g.fill();
  g.restore();
  // rim / knurl zone
  ring(g, 0.74, 0.82, 'rgba(70,40,12,0.55)');
  // tiny dents & wear
  for (let i = 0; i < 160; i++) {
    const x = br() * S, y = br() * S, r = 0.6 + br() * 2;
    g.fillStyle = `rgba(30,15,4,${0.05 + br() * 0.08})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace;
  const rough = new THREE.CanvasTexture(rc);
  map.anisotropy = rough.anisotropy = 8;
  return { map, rough };
}

function buildLidGeometry() {
  const K = 1;
  const prof = [
    [0.0, 0.25, 0], [0.3, 0.25, 0], [0.6, 0.25, 0], [0.735, 0.25, 0],
    [0.735, 0.15, 0], [0.735, 0.012, 0], [0.745, 0.0, 0], [0.78, 0.0, 0], [0.80, 0.0, 0], [0.806, 0.012, 0.3],
    [0.804, 0.04, K], [0.804, 0.09, K], [0.804, 0.14, K], [0.804, 0.19, K], [0.803, 0.225, 0.5],
    [0.795, 0.258, 0], [0.775, 0.284, 0], [0.745, 0.298, 0], [0.70, 0.302, 0],
    [0.60, 0.300, 0], [0.54, 0.300, 0], [0.52, 0.3055, 0], [0.50, 0.312, 0], [0.45, 0.312, 0], [0.43, 0.3055, 0], [0.41, 0.300, 0],
    [0.2, 0.300, 0], [0.0, 0.300, 0],
  ];
  const SEG = 176, L = prof.length;
  const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), SEG);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i <= SEG; i++) {
    const phi = i / SEG * TAU;
    const ridge = Math.pow(0.5 + 0.5 * Math.cos(phi * 44), 1.4);
    for (let j = 0; j < L; j++) {
      const v = i * L + j, amp = prof[j][2];
      if (amp > 0) {
        const r = Math.hypot(pos.getX(v), pos.getZ(v));
        const k = 1 + (0.011 * ridge * amp) / r;
        pos.setX(v, pos.getX(v) * k); pos.setZ(v, pos.getZ(v) * k);
      }
      uv.setXY(v, pos.getX(v) / (2 * 0.82) + 0.5, pos.getZ(v) / (2 * 0.82) + 0.5);
    }
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let j = 0; j < L; j++) { // weld the seam's normals
    const a = j, b = SEG * L + j;
    const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return geo;
}

const lidTex = makeLidTextures();
const lidMat = new THREE.MeshStandardMaterial({
  map: lidTex.map, roughnessMap: lidTex.rough, metalness: 1.0, roughness: 0.7, envMapIntensity: 2.6,
});
// the cap writes the stencil so the x-ray ghost of the tentacles is shown only inside its silhouette
lidMat.stencilWrite = true; lidMat.stencilRef = 1; lidMat.stencilFunc = THREE.AlwaysStencilFunc; lidMat.stencilZPass = THREE.ReplaceStencilOp;
const lidMesh = new THREE.Mesh(buildLidGeometry(), lidMat);
lidMesh.castShadow = true; lidMesh.receiveShadow = true;
scene.add(lidMesh);

const lid = {
  mesh: lidMesh, theta: 0, omega: 0, h: 0, mode: 'thread',
  com: new V3(0, 0.13, 0),
  pos: new V3(), quat: new Q(), vel: new V3(), ang: new V3(),
  sleep: 0, settled: false, bounced: 0,
};
const _Y = new V3(0, 1, 0);
const _qa = new Q(), _qb = new Q();

function lidResetPose() {
  lid.theta = 0; lid.omega = 0; lid.h = 0; lid.mode = 'thread';
  lid.vel.set(0, 0, 0); lid.ang.set(0, 0, 0); lid.sleep = 0; lid.settled = false; lid.bounced = 0;
  lidPlaceThreaded();
}
function lidPlaceThreaded() {
  lid.h = Math.max(0, lid.theta * LID.pitch / TAU);
  const k = lid.h / LID.Hfree;
  const tilt = 0.06 * sstep(0.8, 1.0, k);
  _qa.setFromAxisAngle(_Y, lid.theta);
  _qb.setFromEuler(new THREE.Euler(tilt * Math.sin(lid.theta * 0.5), 0, tilt * Math.cos(lid.theta * 0.5)));
  lid.mesh.quaternion.copy(_qb).multiply(_qa);
  lid.mesh.position.set(0, LID.Y0 + lid.h, 0);
}
/* the point under the lid's centre, for tentacles to touch */
function lidUnderY() { return lid.mesh.position.y + LID.under; }
function lidLocalToWorld(p, out) { return out.copy(p).applyQuaternion(lid.mesh.quaternion).add(lid.mesh.position); }

/* ---------- free-body solver ---------- */
const LID_SAMPLES = [];
for (let k = 0; k < 18; k++) {
  const a = k / 18 * TAU, c = Math.cos(a), s = Math.sin(a);
  LID_SAMPLES.push(new V3(0.805 * c, 0.0 - lid.com.y, 0.805 * s));
  LID_SAMPLES.push(new V3(0.78 * c, 0.285 - lid.com.y, 0.78 * s));
  if (k % 2 === 0) LID_SAMPLES.push(new V3(0.45 * c, 0.302 - lid.com.y, 0.45 * s));
}
LID_SAMPLES.push(new V3(0, 0.302 - lid.com.y, 0));
const LID_INV_M = 1.0, LID_IINV = new V3(1 / 0.17, 1 / 0.30, 1 / 0.17);
const GRAV = 24;
const _bx = new V3(), _by = new V3(), _bz = new V3();
function iinvMul(v, out) {
  _bx.set(1, 0, 0).applyQuaternion(lid.quat); _by.set(0, 1, 0).applyQuaternion(lid.quat); _bz.set(0, 0, 1).applyQuaternion(lid.quat);
  return out.set(0, 0, 0)
    .addScaledVector(_bx, _bx.dot(v) * LID_IINV.x)
    .addScaledVector(_by, _by.dot(v) * LID_IINV.y)
    .addScaledVector(_bz, _bz.dot(v) * LID_IINV.z);
}
const _r = new V3(), _vp = new V3(), _w = new V3(), _t1 = new V3(), _t2 = new V3(), _n = new V3(), _tv = new V3(), _imp = new V3();
function lidContact(r, n, e, mu) {
  _vp.copy(lid.ang).cross(r).add(lid.vel);
  const vn = _vp.dot(n);
  if (vn >= 0) return 0;
  _t1.copy(r).cross(n); iinvMul(_t1, _t2); _t2.cross(r);
  const k = LID_INV_M + n.dot(_t2);
  const ee = vn < -1.4 ? e : 0;
  const j = -(1 + ee) * vn / k;
  _imp.copy(n).multiplyScalar(j);
  lid.vel.addScaledVector(_imp, LID_INV_M);
  _t1.copy(r).cross(_imp); iinvMul(_t1, _t2); lid.ang.add(_t2);
  // Coulomb friction
  _vp.copy(lid.ang).cross(r).add(lid.vel);
  _tv.copy(_vp).addScaledVector(n, -_vp.dot(n));
  const sp = _tv.length();
  if (sp > 1e-4) {
    _tv.multiplyScalar(1 / sp);
    _t1.copy(r).cross(_tv); iinvMul(_t1, _t2); _t2.cross(r);
    const kt = LID_INV_M + _tv.dot(_t2);
    const jt = Math.min(sp / kt, mu * j);
    _imp.copy(_tv).multiplyScalar(-jt);
    lid.vel.addScaledVector(_imp, LID_INV_M);
    _t1.copy(r).cross(_imp); iinvMul(_t1, _t2); lid.ang.add(_t2);
  }
  return -vn;
}
const _wp = new V3(), _jn = new V3();
function stepLidFree(dt) {
  const SUB = 4, h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    lid.vel.y -= GRAV * h;
    let touching = false;
    for (let it = 0; it < 4; it++) {
      let maxPen = 0, hit = 0;
      for (let i = 0; i < LID_SAMPLES.length; i++) {
        _r.copy(LID_SAMPLES[i]).applyQuaternion(lid.quat);
        _wp.copy(_r).add(lid.pos);
        if (_wp.y < 0.004) {
          touching = true;
          const imp = lidContact(_r, _n.set(0, 1, 0), 0.34, 0.5);
          if (imp > hit) hit = imp;
          if (-_wp.y > maxPen) maxPen = -_wp.y;
        }
        // the jar is solid too
        if (_wp.y < 3.44 && _wp.y > 0.02) {
          const rr = Math.hypot(_wp.x, _wp.z), ro = rOutAt(_wp.y);
          if (rr < ro - 0.004) {
            jarOuterNormal(_wp.y, Math.atan2(-_wp.z, _wp.x), _jn);
            const imp = lidContact(_r, _jn, 0.25, 0.3);
            if (imp > hit) hit = imp;
            const push = (ro - rr) * 0.5;
            lid.pos.x += _jn.x * push * 0.3; lid.pos.z += _jn.z * push * 0.3; lid.pos.y += _jn.y * push * 0.3;
          }
        }
      }
      if (maxPen > 0 && it === 0) lid.pos.y += maxPen * 0.85;
      if (hit > 2.2) {
        orbit.shake = Math.max(orbit.shake, Math.min(0.045, hit * 0.006));
        U.thud.value = Math.min(1, U.thud.value + hit * 0.12);
        lid.bounced++;
      }
    }
    lid.vel.multiplyScalar(1 - (touching ? 1.6 : 0.03) * h);
    lid.ang.multiplyScalar(1 - (touching ? 3.2 : 0.35) * h);
    lid.pos.addScaledVector(lid.vel, h);
    _w.copy(lid.ang);
    const wl = _w.length();
    if (wl > 1e-6) {
      _qa.setFromAxisAngle(_w.multiplyScalar(1 / wl), wl * h);
      lid.quat.premultiply(_qa).normalize();
    }
  }
  // settle
  const slow = lid.vel.lengthSq() < 0.06 && lid.ang.lengthSq() < 0.6 && lid.pos.y < 0.6;
  lid.sleep = slow ? lid.sleep + dt : 0;
  if (lid.sleep > 0.6) { lid.settled = true; lid.vel.set(0, 0, 0); lid.ang.set(0, 0, 0); }
  _r.copy(lid.com).applyQuaternion(lid.quat);
  lid.mesh.quaternion.copy(lid.quat);
  lid.mesh.position.copy(lid.pos).sub(_r);
}
/* the moment the thread lets go: a flick from the tentacles sends the cap off to the front-left */
function lidRelease(dir) {
  lid.mode = 'free';
  lid.quat.copy(lid.mesh.quaternion);
  _r.copy(lid.com).applyQuaternion(lid.quat);
  lid.pos.copy(lid.mesh.position).add(_r);
  const axis = new V3().crossVectors(_Y, dir).normalize();
  lid.vel.set(0, 1.7, 0).addScaledVector(dir, 3.3);
  lid.ang.copy(axis).multiplyScalar(3.4).addScaledVector(_Y, lid.omega * 0.9);
  lid.sleep = 0; lid.settled = false;
}
