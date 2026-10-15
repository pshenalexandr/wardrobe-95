// LEGO.JS: turns a flat picture of a person into a hanging 3D voxel figure.
//
// How a 2D picture becomes a 3D body:
//   1. Cut the person out (flood-fill the background in from the image border).
//   2. Shrink the cutout to a coarse grid, about 64 bricks tall.
//   3. Give every grid cell a thickness. Cells deep inside the silhouette (the torso) are thick,
//      cells near the edge (arms, hat brim) are thin: thickness follows the distance to the outline.
//      That "inflates" the flat sprite like a balloon, which is roughly how bodies are shaped.
//   4. Emit only the bricks you can see (the shell), put a stud on every brick with nothing above it.
// All figures share one WebGL renderer that draws at 12 fps, then copies each frame into its own canvas.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const CW = 240, CH = 420; // every figure canvas is this size (CSS px)
const GRID_H = 64;

// ---------- 1-3: picture → voxel grid ----------
export function voxelize(img, rows = GRID_H) {
  const work = 220, wh = Math.round(img.height * work / img.width);
  const c = document.createElement('canvas'); c.width = work; c.height = wh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, work, wh);
  const px = g.getImageData(0, 0, work, wh).data;

  // background colour = median of the border pixels
  const border = [];
  for (let x = 0; x < work; x++) border.push(x, x + (wh - 1) * work);
  for (let y = 0; y < wh; y++) border.push(y * work, y * work + work - 1);
  const med = k => { const v = border.map(i => px[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const greenScreen = bg[1] > bg[0] + 60 && bg[1] > bg[2] + 60;
  const isBg = i => {
    const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
    if (greenScreen && gg > r + 40 && gg > b + 40) return true;
    return Math.hypot(r - bg[0], gg - bg[1], b - bg[2]) < 48;
  };
  // flood fill from the border: background is whatever bg-coloured region touches the edge,
  // so a white shirt in the middle of a white backdrop survives
  const fg = new Uint8Array(work * wh).fill(1);
  const stack = border.filter(isBg);
  stack.forEach(i => (fg[i] = 0));
  while (stack.length) {
    const i = stack.pop(), x = i % work, y = (i / work) | 0;
    for (const j of [x > 0 && i - 1, x < work - 1 && i + 1, y > 0 && i - work, y < wh - 1 && i + work]) {
      if (j !== false && fg[j] && isBg(j)) { fg[j] = 0; stack.push(j); }
    }
  }

  let x0 = work, x1 = -1, y0 = wh, y1 = -1;
  for (let y = 0; y < wh; y++) for (let x = 0; x < work; x++) if (fg[y * work + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) throw new Error('Could not find a person in the picture');

  // resample the bounding box to the brick grid: average colour of foreground pixels per cell
  const H = rows, cell = (y1 - y0 + 1) / H, W = Math.max(1, Math.round((x1 - x0 + 1) / cell));
  const occ = new Uint8Array(W * H), col = new Float32Array(W * H * 3);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    let n = 0, t = 0, r = 0, gg = 0, b = 0;
    const sx0 = x0 + Math.floor(gx * cell), sx1 = x0 + Math.floor((gx + 1) * cell);
    const sy0 = y0 + Math.floor(gy * cell), sy1 = y0 + Math.floor((gy + 1) * cell);
    for (let y = sy0; y < Math.max(sy1, sy0 + 1) && y < wh; y++) for (let x = sx0; x < Math.max(sx1, sx0 + 1) && x < work; x++) {
      t++; const i = y * work + x;
      if (fg[i]) { n++; r += px[i * 4]; gg += px[i * 4 + 1]; b += px[i * 4 + 2]; }
    }
    const k = gy * W + gx;
    if (t && n / t > 0.45) {
      occ[k] = 1;
      // plastic look: a bit more saturation, a few colour levels
      let R = r / n, G = gg / n, B = b / n; const L = (R + G + B) / 3;
      [R, G, B] = [R, G, B].map(v => Math.max(0, Math.min(255, L + (v - L) * 1.25)));
      col.set([R, G, B].map(v => Math.round(v / 255 * 7) / 7), k * 3);
    }
  }
  keepLargest(occ, W, H);

  // 3: chamfer distance to the outline → half-thickness of each column
  const BIG = 1e6, d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = occ[i] ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : d[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (occ[y * W + x])
    d[y * W + x] = Math.min(d[y * W + x], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) if (occ[y * W + x])
    d[y * W + x] = Math.min(d[y * W + x], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
  const half = new Int8Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) if (occ[i]) half[i] = Math.min(5, Math.round(d[i] * 0.55));

  // shoulders: the biggest widening of the silhouette in the upper third (below any hat brim)
  const width = y => { let a = -1, z = -1; for (let x = 0; x < W; x++) if (occ[y * W + x]) { if (a < 0) a = x; z = x; } return a < 0 ? 0 : z - a + 1; };
  let shoulder = Math.round(H * 0.22), best = 0;
  for (let y = Math.round(H * 0.14); y < Math.round(H * 0.35); y++) {
    const jump = width(y) - width(y - 2);
    if (jump > best) { best = jump; shoulder = y; }
  }
  return { W, H, occ, col, half, shoulder, shoulderW: width(Math.min(H - 1, shoulder + 2)) };
}

function keepLargest(occ, W, H) {
  const lab = new Int32Array(W * H); let bestId = 0, bestN = 0, id = 0;
  for (let s = 0; s < W * H; s++) if (occ[s] && !lab[s]) {
    id++; let n = 0; const st = [s]; lab[s] = id;
    while (st.length) {
      const i = st.pop(), x = i % W; n++;
      for (const j of [x > 0 && i - 1, x < W - 1 && i + 1, i - W, i + W])
        if (j !== false && j >= 0 && j < W * H && occ[j] && !lab[j]) { lab[j] = id; st.push(j); }
    }
    if (n > bestN) { bestN = n; bestId = id; }
  }
  for (let i = 0; i < W * H; i++) if (lab[i] !== bestId) occ[i] = 0;
}

// ---------- 4: voxel grid → three.js figure on a hanger ----------
const brickGeo = new THREE.BoxGeometry(1, 1, 1);
const studGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 8);
const mat = new THREE.MeshLambertMaterial({ flatShading: true });

export function buildFigure(v) {
  const { W, H, occ, col, half } = v;
  const hAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H || !occ[y * W + x]) ? -1 : half[y * W + x];
  const bricks = [], studs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = hAt(x, y); if (h < 0) continue;
    for (let z = -h; z <= h; z++) {
      const a = Math.abs(z);
      const shell = a === h || hAt(x - 1, y) < a || hAt(x + 1, y) < a || hAt(x, y - 1) < a || hAt(x, y + 1) < a;
      if (!shell) continue;
      const k = (y * W + x) * 3, c = [col[k], col[k + 1], col[k + 2]];
      bricks.push([x, y, z, c]);
      if (hAt(x, y - 1) < a) studs.push([x, y, z, c]);
    }
  }

  // the grid hangs from the pivot (hook tip) at y=0; the hanger bar sits on the shoulders, behind the body
  const hook = v.shoulder + 5; // the hook rises above the head
  const wx = x => x - W / 2 + 0.5, wy = y => -(hook + y - v.shoulder);
  const fig = new THREE.Group();
  const mk = (geo, list, dy) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D(), c = new THREE.Color();
    list.forEach(([x, y, z, cc], i) => {
      o.position.set(wx(x), wy(y) + dy, z); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.setRGB(cc[0], cc[1], cc[2], THREE.SRGBColorSpace));
    });
    return m;
  };
  fig.add(mk(brickGeo, bricks, 0), mk(studGeo, studs, 0.55));

  let back = 0; for (let x = 0; x < W; x++) back = Math.max(back, hAt(x, v.shoulder + 2));
  const zH = -(back + 1.2), sw = Math.max(6, v.shoulderW * 0.8), yBar = wy(v.shoulder) + 0.5;
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a2b, flatShading: true });
  const steel = new THREE.MeshLambertMaterial({ color: 0x9a9a9a, flatShading: true });
  const box = (w, h, d, m, x, y, z, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.z = rz; fig.add(b); };
  box(sw, 0.8, 0.8, wood, 0, yBar, zH);                                   // bar
  const ax = sw / 2, rise = -3.2 - yBar, len = Math.hypot(ax, rise), ang = Math.atan2(rise, ax);
  box(len, 0.8, 0.8, wood, ax / 2, (yBar - 3.2) / 2, zH, -ang);           // arms up to the neck of the hanger
  box(len, 0.8, 0.8, wood, -ax / 2, (yBar - 3.2) / 2, zH, ang);
  box(0.4, 3.2, 0.4, steel, 0, -1.6, zH);                                 // hook shaft
  box(1.6, 0.4, 0.4, steel, 0.6, 0, zH);                                  // hook curl
  box(0.4, 1.2, 0.4, steel, 1.2, -0.6, zH);

  const pivot = new THREE.Group(); pivot.add(fig);
  const totalH = hook + (H - v.shoulder);
  const span = Math.max(W, 2 * 5 + 2, sw);
  return { pivot, totalH, span, W, depth: 2 * Math.max(...half) + 1 };
}

// ---------- shared renderer, 12 fps ----------
let renderer, scene, camera;
const actors = new Set();
function init() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  renderer.setPixelRatio(1); renderer.setSize(CW, CH, false);
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(0.7, 1, 1.2); scene.add(sun);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  // a touch from above so the studs show; the camera sits on the line through the origin so framing stays put
  camera.position.set(0, 200 * Math.tan(0.09), 200); camera.rotation.x = -0.09;
  setInterval(frame, 1000 / 12);
}

// one actor = one figure drawn into one canvas; `want()` returns the target yaw in degrees (or null to spin)
export function mount(canvas, vox, want, opts = {}) {
  init();
  const f = buildFigure(vox);
  const s = Math.min((CH - 64) / f.totalH, (CW - 16) / f.span); // leave the floor free
  const a = { canvas, ctx: canvas.getContext('2d'), f, s, want, yaw: opts.startYaw ?? 90, phase: Math.random() * 6, sway: opts.sway ?? true };
  canvas.width = CW; canvas.height = CH;
  actors.add(a);
  return { frontWidth: f.W * s, sideWidth: f.depth * s, unmount: () => actors.delete(a) };
}

function frame() {
  const t = performance.now() / 1000;
  for (const a of actors) {
    if (!a.canvas.isConnected) { actors.delete(a); continue; }
    if (!a.canvas.offsetParent) continue; // hidden: skip
    const target = a.want();
    if (target === null) a.yaw = (a.yaw + 15) % 360;
    else {
      let d = ((target - a.yaw + 540) % 360) - 180; // shortest way round
      a.yaw += Math.sign(d) * Math.min(Math.abs(d), 15); // 15° per frame at 12 fps: deliberately choppy
    }
    const p = a.f.pivot;
    p.rotation.set(0, 0, 0);
    p.rotation.z = a.sway && target !== 0 ? Math.sin(t * 0.9 + a.phase) * 0.03 : 0;
    p.children[0].rotation.y = THREE.MathUtils.degToRad(a.yaw);
    scene.add(p);
    // the pivot (hook tip) sits 6px below the top edge, a slightly-from-above camera shows the studs
    const top = 6 / a.s;
    camera.left = -CW / 2 / a.s; camera.right = CW / 2 / a.s; camera.top = top; camera.bottom = top - CH / a.s;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    scene.remove(p);
    a.ctx.clearRect(0, 0, CW, CH);
    a.ctx.drawImage(renderer.domElement, 0, 0);
  }
}
