// ─────────────────────────────────────────────────────────────────────────────
// ReceiptPrinter3D — the landing page's WebGL hero.
//
// A thermal printer prints a Softshape bill. The paper strip is a deformable
// ribbon: each frame its centre line is integrated from a curvature profile
// (straight out of the slot, then flopping toward the viewer and curling),
// with a little flutter and twist so it reads as paper, not a card.
//
// Loaded with a dynamic import so three.js only ships to the landing page.
// API: setPrinted(0..1), setScroll(0..1), setPointer(x, y in -1..1),
//      setActive(bool), dispose().
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const RED = '#E3262B';
const PAPER_W = 1.5;
const PAPER_L = 7.2;
const SEG_L = 220;
const SEG_W = 10;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ── Receipt artwork ─────────────────────────────────────────────────────────
function drawReceipt() {
  const W = 760;
  const H = Math.round(W * (PAPER_L / PAPER_W));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = '#FBFAF6';
  g.fillRect(0, 0, W, H);
  // faint thermal paper grain
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.025})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }

  const ink = '#1C1C1E';
  const soft = '#5D5D60';
  const M = 54;
  const mono = (size, weight = 400) => `${weight} ${size}px 'Roboto Mono', ui-monospace, Menlo, monospace`;
  const sans = (size, weight = 600) => `${weight} ${size}px 'Inter Tight', 'Plus Jakarta Sans', Arial, sans-serif`;
  let y = 120;

  const row = (l, r, font = mono(30), color = ink) => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'left';
    g.fillText(l, M, y);
    if (r) {
      g.textAlign = 'right';
      g.fillText(r, W - M, y);
    }
  };
  const center = (t, font, color = ink) => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.fillText(t, W / 2, y);
  };
  const dash = () => {
    g.strokeStyle = '#8A8A8D';
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(M, y);
    g.lineTo(W - M, y);
    g.stroke();
    g.setLineDash([]);
  };

  // tear edge at the top
  g.fillStyle = '#FBFAF6';
  center('softshape', sans(78, 700));
  y += 54;
  center('Table 5   Dine in   4 guests', mono(26), soft);
  y += 52;
  dash();
  y += 62;
  row('KOT 0142', '21:42', mono(30, 500));
  y += 46;
  row('Captain', 'Ravi', mono(28), soft);
  y += 46;
  row('Bill', '0142', mono(28), soft);
  y += 44;
  dash();
  y += 66;

  const items = [
    ['1  Paneer tikka', '320.00'],
    ['4  Butter naan', '200.00'],
    ['1  Dal makhani', '280.00'],
    ['2  Masala chaas', '120.00'],
    ['2  Draught beer', '560.00'],
  ];
  for (const [l, r] of items) {
    row(l, r);
    y += 54;
  }
  y += 4;
  dash();
  y += 62;
  row('Subtotal', '1,480.00', mono(28), soft);
  y += 46;
  row('CGST 2.5%', '37.00', mono(28), soft);
  y += 46;
  row('SGST 2.5%', '37.00', mono(28), soft);
  y += 40;
  dash();
  y += 78;
  row('TOTAL', '₹ 1,554.00', mono(42, 700));
  y += 40;
  dash();
  y += 64;
  row('Paid by', 'UPI', mono(28), soft);
  y += 46;
  row('Ref', '4182 7710 3326', mono(28), soft);
  y += 80;

  // barcode
  let x = M + 30;
  const end = W - M - 30;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = ink;
  while (x < end) {
    const w = 2 + Math.floor(rnd() * 4) * 2;
    if (rnd() > 0.35) g.fillRect(x, y, w, 120);
    x += w + 3;
  }
  y += 170;
  center('Thank you. Visit again.', mono(28), ink);
  y += 50;
  center('Printed offline, synced 21:43', mono(24), soft);
  y += 120;

  // second, shorter ticket below: the bar ticket, so the long strip stays busy
  dash();
  y += 70;
  center('BAR', sans(44, 700));
  y += 54;
  row('BOT 0088', '21:42', mono(28, 500));
  y += 50;
  row('2  Masala chaas', '', mono(30));
  y += 52;
  row('2  Draught beer', '', mono(30));
  y += 50;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawBadge() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.font = "600 64px 'Inter Tight', 'Plus Jakarta Sans', Arial, sans-serif";
  g.fillStyle = 'rgba(255,255,255,0.78)';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('softshape', 8, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Scene ───────────────────────────────────────────────────────────────────
// Performance notes (the landing page must stay smooth on budget phones):
// - no real-time shadows: a pre-drawn contact shadow sits under the printer;
// - the paper is a Lambert (matte) surface, normals are written analytically
//   from the curve instead of computeVertexNormals();
// - quality 'low' (phones) uses fewer segments, no environment map and a
//   lower pixel-ratio cap;
// - a watchdog measures real frame times: if the device can't keep up it first
//   drops the pixel ratio to 1, then freezes the flutter and only redraws when
//   something actually changes (scroll, pointer, printing).

function drawContactShadow() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function createReceiptScene(container, { reducedMotion = false, quality = 'high', onDegrade } = {}) {
  const low = quality === 'low';
  const SEG_L_Q = low ? 120 : SEG_L;
  const SEG_W_Q = low ? 6 : SEG_W;
  const maxDpr = low ? 1.5 : 2;

  const renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: true, powerPreference: low ? 'low-power' : 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  let pmrem = null;
  let envTex = null;
  if (!low) {
    pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.55;
  } else {
    scene.add(new THREE.HemisphereLight('#ffffff', '#202024', 0.9));
  }

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

  // lights (no shadow maps)
  const key = new THREE.DirectionalLight('#FFF3E6', 2.4);
  key.position.set(-4, 7, 6);
  scene.add(key);
  const rim = new THREE.PointLight(RED, 38, 14, 1.6);
  rim.position.set(3.5, 2.5, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#BFD3FF', 0.35);
  fill.position.set(5, 1, 4);
  scene.add(fill);

  const rig = new THREE.Group();
  scene.add(rig);

  // printer
  const printer = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#1A1A1D', roughness: 0.42, metalness: 0.15 });
  printer.add(new THREE.Mesh(new RoundedBoxGeometry(2.5, 1.25, 2.1, low ? 3 : 5, 0.2), bodyMat));
  const lid = new THREE.Mesh(
    new RoundedBoxGeometry(2.3, 0.08, 1.35, 2, 0.04),
    new THREE.MeshStandardMaterial({ color: '#232327', roughness: 0.3, metalness: 0.2 }),
  );
  lid.position.set(0, 0.64, -0.3);
  printer.add(lid);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: '#050506' }));
  slot.position.set(0, 0.62, 0.52);
  printer.add(slot);
  const tear = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.85, 12),
    new THREE.MeshStandardMaterial({ color: '#B9B9BE', roughness: 0.25, metalness: 1 }),
  );
  tear.rotation.z = Math.PI / 2;
  tear.position.set(0, 0.65, 0.62);
  printer.add(tear);
  const ledMat = new THREE.MeshBasicMaterial({ color: RED });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), ledMat);
  led.position.set(0.95, 0.12, 1.06);
  printer.add(led);
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.225),
    new THREE.MeshBasicMaterial({ map: drawBadge(), transparent: true, depthWrite: false }),
  );
  badge.position.set(-0.55, 0.12, 1.052);
  printer.add(badge);
  printer.position.set(0, -1.9, 0);
  rig.add(printer);

  // pre-drawn contact shadow instead of a shadow map
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 4.2),
    new THREE.MeshBasicMaterial({ map: drawContactShadow(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.35, -2.52, 0.2);
  rig.add(shadow);

  // paper ribbon
  const geo = new THREE.PlaneGeometry(PAPER_W, PAPER_L, SEG_W_Q, SEG_L_Q);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const rows = SEG_L_Q + 1;
  const cols = SEG_W_Q + 1;
  const receiptTex = drawReceipt();
  receiptTex.anisotropy = Math.min(low ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
  const paperMat = new THREE.MeshLambertMaterial({ map: receiptTex, side: THREE.DoubleSide });
  paperMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        if ( !gl_FrontFacing ) sampledDiffuseColor = vec4( 0.955, 0.948, 0.93, 1.0 );
        diffuseColor *= sampledDiffuseColor;
      #endif`,
    );
  };
  const paper = new THREE.Mesh(geo, paperMat);
  paper.frustumCulled = false;
  rig.add(paper);

  const slotOrigin = new THREE.Vector3(0, printer.position.y + 0.62, 0.52);
  const cy = new Float32Array(rows);
  const cz = new Float32Array(rows);
  const th = new Float32Array(rows);

  const state = {
    printed: 0,
    scroll: 0,
    px: 0,
    py: 0,
    tpx: 0,
    tpy: 0,
    active: true,
    time: 0,
    frozen: !!reducedMotion,
    dirty: true,
  };

  function curvature(s, t) {
    // Rises out of the slot with a gentle bow toward the viewer, then rolls
    // backwards at the top. Rolling away keeps the printed side on the outside
    // of the curl, so the text stays readable from the front.
    const bow = 0.3 * smooth(0.6, 1.6, s) * (1 - smooth(2.0, 3.2, s));
    const roll = -2.3 * smooth(3.7, 5.9, s);
    const flutter = 0.06 * Math.sin(t * 1.15 + s * 1.3) * smooth(0.6, 2.5, s);
    return bow + roll + flutter;
  }

  const STEP = low ? 0.06 : 0.04;
  function updatePaper() {
    const L = PAPER_L;
    const P = state.printed * L;
    const t = state.time;
    // Row r sits at arc length s = P - (r / SEG) * L from the slot; s grows as
    // r falls, so integrate the centre line from the last row to the first.
    let prevS = 0;
    let y = 0;
    let z = 0;
    let theta = 0;
    for (let r = rows - 1; r >= 0; r--) {
      const s = P - (r / SEG_L_Q) * L;
      if (s <= 0) {
        // unprinted paper stays folded inside the printer body
        cy[r] = Math.max(s, -0.45);
        cz[r] = 0;
        th[r] = 0;
        continue;
      }
      const steps = Math.max(1, Math.ceil((s - prevS) / STEP));
      const ds = (s - prevS) / steps;
      for (let k = 0; k < steps; k++) {
        theta += curvature(prevS + (k + 0.5) * ds, t) * ds;
        y += Math.cos(theta) * ds;
        z += Math.sin(theta) * ds;
      }
      prevS = s;
      cy[r] = y;
      cz[r] = z;
      th[r] = theta;
    }
    for (let r = 0; r < rows; r++) {
      const s = P - (r / SEG_L_Q) * L;
      const live = s > 0;
      const sinT = Math.sin(th[r]);
      const cosT = Math.cos(th[r]);
      const ny = -sinT;
      const nz = cosT;
      const twist = live ? 0.16 * Math.sin(t * 0.8 + s * 0.85) * smooth(1.2, 5, s) : 0;
      const ct = Math.cos(twist);
      const st = Math.sin(twist);
      const drift = live ? 0.28 * Math.sin(s * 0.55 + t * 0.45) * smooth(1, 5, s) : 0;
      const cupK = live ? 0.05 * smooth(0.3, 1.5, s) : 0;
      // surface normal: the curve normal rotated by the twist about the tangent
      const nX = -st;
      const nY = ct * ny;
      const nZ = ct * nz;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const u = (c / SEG_W_Q - 0.5) * PAPER_W;
        const off = u * st + cupK * u * u;
        pos.setXYZ(i, slotOrigin.x + u * ct + drift, slotOrigin.y + cy[r] + ny * off, slotOrigin.z + cz[r] + nz * off);
        nor.setXYZ(i, nX, nY, nZ);
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole printer and strip framed on narrow screens
    const dist = camera.aspect < 0.7 ? 19 : camera.aspect < 1 ? 14.5 : 13.5;
    camera.userData.dist = dist;
    camera.updateProjectionMatrix();
    state.dirty = true;
  }

  // Watchdog: after a short warm-up, compare real frame intervals with the
  // display's budget. Level 1 drops the pixel ratio; level 2 freezes flutter
  // and switches to redraw-on-change.
  let degrade = 0;
  let samples = [];
  let warm = 0;
  function watch(delta) {
    if (degrade >= 2 || state.frozen) return;
    if (warm < 20) {
      warm++;
      return;
    }
    samples.push(delta);
    if (samples.length < 45) return;
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    samples = [];
    if (median > 28) {
      degrade++;
      if (degrade === 1 && dpr > 1) {
        dpr = 1;
        renderer.setPixelRatio(1);
        resize();
      } else {
        degrade = 2;
        state.frozen = true;
      }
      onDegrade?.(degrade, median);
    }
  }

  let raf = 0;
  let last = performance.now();
  let lastKey = '';
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const delta = now - last;
    last = now;
    if (!state.active) return;
    const dt = Math.min(0.05, delta / 1000);
    if (!state.frozen) state.time += dt;

    state.px += (state.tpx - state.px) * 0.06;
    state.py += (state.tpy - state.py) * 0.06;

    // When frozen, skip the frame entirely unless something visible changed.
    if (state.frozen) {
      const k = `${state.printed.toFixed(4)}|${state.scroll.toFixed(4)}|${state.px.toFixed(3)}|${state.py.toFixed(3)}`;
      if (k === lastKey && !state.dirty) return;
      lastKey = k;
    }
    state.dirty = false;

    const sc = state.scroll;
    rig.rotation.y = -0.98 + state.px * 0.3 + sc * 0.5;
    rig.rotation.x = state.py * 0.06;
    rig.position.y = -0.3 + sc * 0.2;

    const dist = (camera.userData.dist || 18.5) - sc * 1.2;
    camera.position.set(0.4, 2.6 + sc * 0.6, dist);
    camera.lookAt(0, 0.75 + sc * 0.55, 0);

    // LED blinks while printing
    const blink = state.printed < 0.995 && !state.frozen ? 0.6 + 0.4 * Math.sin(state.time * 18) : 1;
    ledMat.color.setRGB(0.89 * blink + 0.1, 0.15 * blink, 0.17 * blink);

    updatePaper();
    renderer.render(scene, camera);
    watch(delta);
  }

  resize();
  updatePaper();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  raf = requestAnimationFrame(frame);

  return {
    setPrinted(v) { state.printed = Math.min(1, Math.max(0, v)); },
    setScroll(v) { state.scroll = Math.min(1, Math.max(0, v)); },
    setPointer(x, y) { state.tpx = x; state.tpy = y; },
    setActive(v) {
      if (v && !state.active) {
        state.dirty = true;
        last = performance.now();
      }
      state.active = v;
      // A paused canvas is hidden as well: some mobile compositors repaint a
      // stale WebGL frame over the page, and a hidden layer costs nothing.
      renderer.domElement.style.visibility = v ? 'visible' : 'hidden';
    },
    get degradeLevel() { return degrade; },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      envTex?.dispose();
      pmrem?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
