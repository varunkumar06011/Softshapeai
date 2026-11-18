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
export function createReceiptScene(container, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

  // lights
  const key = new THREE.DirectionalLight('#FFF3E6', 2.4);
  key.position.set(-4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -4;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
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
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.5, 1.25, 2.1, 6, 0.2), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  printer.add(body);
  const lid = new THREE.Mesh(
    new RoundedBoxGeometry(2.3, 0.08, 1.35, 4, 0.04),
    new THREE.MeshStandardMaterial({ color: '#232327', roughness: 0.3, metalness: 0.2 }),
  );
  lid.position.set(0, 0.64, -0.3);
  lid.receiveShadow = true;
  printer.add(lid);
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.06, 0.12),
    new THREE.MeshBasicMaterial({ color: '#050506' }),
  );
  slot.position.set(0, 0.62, 0.52);
  printer.add(slot);
  const tear = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.85, 16),
    new THREE.MeshStandardMaterial({ color: '#B9B9BE', roughness: 0.25, metalness: 1 }),
  );
  tear.rotation.z = Math.PI / 2;
  tear.position.set(0, 0.65, 0.62);
  printer.add(tear);
  const ledMat = new THREE.MeshStandardMaterial({ color: RED, emissive: RED, emissiveIntensity: 2.2 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 20), ledMat);
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

  // ground shadow
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.45 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.53;
  ground.receiveShadow = true;
  rig.add(ground);

  // paper ribbon
  const geo = new THREE.PlaneGeometry(PAPER_W, PAPER_L, SEG_W, SEG_L);
  const pos = geo.attributes.position;
  const rows = SEG_L + 1;
  const cols = SEG_W + 1;
  const receiptTex = drawReceipt();
  receiptTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const paperMat = new THREE.MeshStandardMaterial({ map: receiptTex, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
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
  paper.castShadow = true;
  paper.receiveShadow = true;
  paper.frustumCulled = false;
  rig.add(paper);

  const slotOrigin = new THREE.Vector3(0, printer.position.y + 0.62, 0.52);
  const sArr = new Float32Array(rows);
  const cy = new Float32Array(rows);
  const cz = new Float32Array(rows);
  const th = new Float32Array(rows);
  const order = Array.from({ length: rows }, (_, i) => i);

  const state = {
    printed: 0,
    scroll: 0,
    px: 0,
    py: 0,
    tpx: 0,
    tpy: 0,
    active: true,
    time: 0,
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

  function updatePaper() {
    const L = PAPER_L;
    const P = state.printed * L;
    const t = state.time;
    // row r: v = r / SEG_L, PlaneGeometry row 0 is the top edge (+y) = tip
    for (let r = 0; r < rows; r++) sArr[r] = P - (r / SEG_L) * L;
    // integrate centre line in order of increasing s
    order.sort((a, b) => sArr[a] - sArr[b]);
    let prevS = 0;
    let y = 0;
    let z = 0;
    let theta = 0;
    for (const r of order) {
      const s = sArr[r];
      if (s <= 0) {
        // unprinted paper stays folded inside the printer body
        cy[r] = Math.max(s, -0.45);
        cz[r] = 0;
        th[r] = 0;
        continue;
      }
      // sub-step for accuracy
      const steps = Math.max(1, Math.ceil((s - prevS) / 0.03));
      const ds = (s - prevS) / steps;
      for (let k = 0; k < steps; k++) {
        const sm = prevS + (k + 0.5) * ds;
        theta += curvature(sm, t) * ds;
        y += Math.cos(theta) * ds;
        z += Math.sin(theta) * ds;
      }
      prevS = s;
      cy[r] = y;
      cz[r] = z;
      th[r] = theta;
    }
    for (let r = 0; r < rows; r++) {
      const s = sArr[r];
      const ny = -Math.sin(th[r]);
      const nz = Math.cos(th[r]);
      const twist = s > 0 ? 0.16 * Math.sin(t * 0.8 + s * 0.85) * smooth(1.2, 5, s) : 0;
      const ct = Math.cos(twist);
      const st = Math.sin(twist);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const u = (c / SEG_W - 0.5) * PAPER_W;
        // slight curl across the width, as thermal paper does
        const cup = s > 0 ? 0.05 * (u * u) * smooth(0.3, 1.5, s) : 0;
        const drift = s > 0 ? 0.28 * Math.sin(s * 0.55 + t * 0.45) * smooth(1, 5, s) : 0;
        const x = u * ct + drift;
        const off = u * st + cup;
        pos.setXYZ(i, slotOrigin.x + x, slotOrigin.y + cy[r] + ny * off, slotOrigin.z + cz[r] + nz * off);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
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
  }

  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!state.active) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reducedMotion) state.time += dt;

    state.px += (state.tpx - state.px) * 0.05;
    state.py += (state.tpy - state.py) * 0.05;

    const sc = state.scroll;
    rig.rotation.y = -0.98 + state.px * 0.3 + sc * 0.5;
    rig.rotation.x = state.py * 0.06;
    rig.position.y = -0.3 + sc * 0.2;

    const dist = (camera.userData.dist || 18.5) - sc * 1.2;
    camera.position.set(0.4, 2.6 + sc * 0.6, dist);
    camera.lookAt(0, 0.75 + sc * 0.55, 0);

    // LED blinks while printing
    ledMat.emissiveIntensity = state.printed < 0.995 ? 1.4 + Math.sin(state.time * 18) * 1.1 : 2.2;

    updatePaper();
    renderer.render(scene, camera);
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
      state.active = v;
      // A paused canvas is hidden as well: some mobile compositors repaint a
      // stale WebGL frame over the page, and a hidden layer costs nothing.
      renderer.domElement.style.visibility = v ? 'visible' : 'hidden';
    },
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
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
