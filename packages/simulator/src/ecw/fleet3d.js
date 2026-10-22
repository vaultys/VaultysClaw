/**
 * The fleet view's theatre, in three.js. Pure presentation: it listens for the `fleet-state` event
 * the page already polls, and draws what the presenter reports — positions, statuses, and every
 * message a peer accepted or refused. It decides nothing.
 *
 * Map coordinates (1040 × 640, the presenter's) become the ground plane: X = x − 520, Z = y − 320.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const C = {
  bg: 0x070d14,
  fleet: 0x38bdf8,
  ok: 0x34d399,
  deny: 0xf43f5e,
  warn: 0xfbbf24,
  ai: 0xa78bfa,
  hijack: 0xfb923c,
  shield: 0x67e8f9,
};
const GROUND = (x, y) => new THREE.Vector3(x - 520, 0, y - 320);
const AI_X = 1135;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const host = document.getElementById("scene");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
} catch {
  host.insertAdjacentHTML("beforeend", '<p class="scene-fallback">WebGL indisponible sur ce poste : la vue 3D ne peut pas s\'afficher.</p>');
  throw new Error("WebGL unavailable");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
host.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.className = "scene-labels";
host.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.FogExp2(C.bg, 0.0009);

const camera = new THREE.PerspectiveCamera(40, 2, 1, 5000);
const HOME_TARGET = new THREE.Vector3(40, 0, 10);
const HOME_CAMERA = new THREE.Vector3(-120, 560, 760);
camera.position.set(0, 1500, 1900);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = 1.38;
controls.minDistance = 120;
controls.maxDistance = 1800;
controls.autoRotateSpeed = 0.35;
controls.enabled = false;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.5, 0.22);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0x9ccfff, 0x0a1420, 0.9));
const sun = new THREE.DirectionalLight(0xcfe8ff, 1.4);
sun.position.set(300, 600, 250);
scene.add(sun);

// ─── Shared textures ───────────────────────────────────────────────────────────

function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = canvasTexture(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.75)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});
const CROSS = canvasTexture(128, (g, s) => {
  g.strokeStyle = "#f43f5e";
  g.lineWidth = 7;
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 12;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(s * 0.32, s * 0.32);
  g.lineTo(s * 0.68, s * 0.68);
  g.moveTo(s * 0.68, s * 0.32);
  g.lineTo(s * 0.32, s * 0.68);
  g.stroke();
});
const glowSprite = (color, size, opacity = 1) => {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  s.scale.setScalar(size);
  return s;
};
const additive = (color, opacity, extra = {}) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, ...extra });

// ─── The theatre ───────────────────────────────────────────────────────────────

{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 3000), new THREE.MeshStandardMaterial({ color: 0x08121c, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.5;
  scene.add(floor);
  const grid = new THREE.GridHelper(2400, 60, 0x153049, 0x0e2132);
  grid.material.transparent = true;
  grid.material.opacity = 0.75;
  scene.add(grid);
}

// Ambient "data dust" drifting above the field.
const dust = (() => {
  const n = 700;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 1800;
    pos[i * 3 + 1] = 20 + Math.random() * 360;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 1300;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0x3fa9d6, size: 2.2, map: GLOW, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  scene.add(pts);
  return pts;
})();

/** The geofence: a glowing curtain along the authorised zone's rounded rectangle. */
const fenceUniforms = { time: { value: 0 }, color: { value: new THREE.Color(C.fleet) } };
{
  const [x0, z0, x1, z1, r] = [-480, -260, 470, 280, 22];
  const path = [];
  const corner = (cx, cz, a0) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      path.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
  };
  corner(x1 - r, z0 + r, -Math.PI / 2);
  corner(x1 - r, z1 - r, 0);
  corner(x0 + r, z1 - r, Math.PI / 2);
  corner(x0 + r, z0 + r, Math.PI);
  path.push(path[0].clone());
  const H = 46;
  const pos = [];
  const uv = [];
  let along = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = a.distanceTo(b);
    const u0 = along / 40;
    const u1 = (along + len) / 40;
    along += len;
    pos.push(a.x, 0, a.y, b.x, 0, b.y, b.x, H, b.y, a.x, 0, a.y, b.x, H, b.y, a.x, H, a.y);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const curtain = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: fenceUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform float time; uniform vec3 color; varying vec2 vUv;
        void main(){
          float base = pow(1.0 - vUv.y, 2.2) * 0.2;
          float scan = exp(-pow((vUv.y - fract(time * 0.22)) * 14.0, 2.0)) * 0.35 * (1.0 - vUv.y);
          float ribs = smoothstep(0.96, 1.0, fract(vUv.x)) * 0.25 * (1.0 - vUv.y);
          gl_FragColor = vec4(color, base + scan + ribs);
        }`,
    })
  );
  scene.add(curtain);
  const edge = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(path.map((p) => new THREE.Vector3(p.x, 0.6, p.y))),
    new THREE.LineBasicMaterial({ color: C.fleet, transparent: true, opacity: 0.45 })
  );
  scene.add(edge);
  const tag = document.createElement("div");
  tag.className = "lbl zone";
  tag.textContent = "ZONE AUTORISÉE · GÉORÉPERAGE";
  const o = new CSS2DObject(tag);
  o.position.set(x0 + 150, 52, z0);
  scene.add(o);
}

/** The C2's radar sweep over the theatre. */
const radarUniforms = { time: { value: 0 } };
{
  const radar = new THREE.Mesh(
    new THREE.CircleGeometry(380, 96),
    new THREE.ShaderMaterial({
      uniforms: radarUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p) * 2.0;
          float a = atan(p.y, p.x);
          float sweep = mod(a - time * 0.9, 6.28318);
          float trail = exp(-sweep * 3.0) * 0.16 * (1.0 - r);
          float rings = (smoothstep(0.012, 0.0, abs(fract(r * 4.0) - 0.5) - 0.488)) * 0.035;
          gl_FragColor = vec4(0.22, 0.74, 0.97, (trail + rings) * step(r, 1.0));
        }`,
    })
  );
  radar.rotation.x = -Math.PI / 2;
  radar.position.copy(GROUND(500, 560)).setY(0.4);
  scene.add(radar);
  const base = new THREE.Mesh(new THREE.RingGeometry(40, 46, 64), additive(C.fleet, 0.35, { side: THREE.DoubleSide }));
  base.rotation.x = -Math.PI / 2;
  base.position.copy(GROUND(500, 560)).setY(0.5);
  scene.add(base);
}

/** Where the AI agents live: processes, not places — a floating platform off the map. */
{
  const deck = new THREE.Mesh(new THREE.BoxGeometry(150, 2, 520), additive(C.ai, 0.06));
  deck.position.set(AI_X - 520, 96, -40);
  scene.add(deck);
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(150, 2, 520)), new THREE.LineBasicMaterial({ color: C.ai, transparent: true, opacity: 0.6 }));
  rim.position.copy(deck.position);
  scene.add(rim);
  const tag = document.createElement("div");
  tag.className = "lbl zone ai";
  tag.innerHTML = "AGENTS IA<br><span>processus, hors carte</span>";
  const o = new CSS2DObject(tag);
  o.position.set(AI_X - 520, 130, -300);
  scene.add(o);
}

// ─── Models ────────────────────────────────────────────────────────────────────

const darkMetal = () => new THREE.MeshStandardMaterial({ color: 0x1a2735, metalness: 0.75, roughness: 0.35 });

function makeDrone() {
  const g = new THREE.Group();
  const accent = new THREE.MeshBasicMaterial({ color: C.fleet });
  const body = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 9), darkMetal());
  body.rotation.y = Math.PI / 4;
  g.add(body);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), accent);
  canopy.position.y = 1.4;
  g.add(canopy);
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(13, 1, 1.4), darkMetal());
    arm.position.set(Math.cos(a) * 6.5, 0.4, Math.sin(a) * 6.5);
    arm.rotation.y = -a;
    g.add(arm);
    const hub = new THREE.Group();
    hub.position.set(Math.cos(a) * 12, 1.6, Math.sin(a) * 12);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.2, 24), additive(C.fleet, 0.16, { side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    hub.add(disc);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 0.9), new THREE.MeshBasicMaterial({ color: 0x9fb6c9 }));
    hub.add(blade);
    g.add(hub);
    rotors.push({ blade, disc });
  }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(16, 44, 32, 1, true), additive(C.fleet, 0.05, { side: THREE.DoubleSide }));
  beam.position.y = -23;
  g.add(beam);
  return { group: g, accent, rotors, beam, scale: 2 };
}

function makeUgv() {
  const g = new THREE.Group();
  const accent = new THREE.MeshBasicMaterial({ color: C.fleet });
  const body = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 10), darkMetal());
  body.position.y = 5;
  g.add(body);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(16.4, 1, 10.4), accent);
  strip.position.y = 6.5;
  g.add(strip);
  const sensor = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4, 12), accent);
  sensor.position.set(4, 10, 0);
  g.add(sensor);
  for (const [x, z] of [[-5, -5.5], [5, -5.5], [-5, 5.5], [5, 5.5]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2, 16), new THREE.MeshStandardMaterial({ color: 0x0b1118 }));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 2.6, z);
    g.add(w);
  }
  return { group: g, accent, scale: 1.8 };
}

function makeC2() {
  const g = new THREE.Group();
  const accent = new THREE.MeshBasicMaterial({ color: C.fleet });
  const geo = new THREE.CylinderGeometry(10, 14, 28, 6);
  const tower = new THREE.Mesh(geo, darkMetal());
  tower.position.y = 14;
  g.add(tower);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: C.fleet }));
  edges.position.y = 14;
  g.add(edges);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 22, 6), darkMetal());
  mast.position.y = 39;
  g.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), accent);
  beacon.position.y = 51;
  g.add(beacon);
  const light = new THREE.PointLight(C.fleet, 400, 260);
  light.position.y = 51;
  g.add(light);
  return { group: g, accent, beacon, scale: 1.5 };
}

function makeAgent() {
  const g = new THREE.Group();
  const accent = new THREE.MeshBasicMaterial({ color: C.ai });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), accent);
  g.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(13, 1), new THREE.MeshBasicMaterial({ color: C.ai, wireframe: true, transparent: true, opacity: 0.55 }));
  g.add(shell);
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(19, 0.4, 8, 64), additive(C.ai, 0.6));
  orbit.rotation.x = Math.PI / 2.4;
  g.add(orbit);
  return { group: g, accent, core, shell, orbit, scale: 1 };
}

const entities = new Map();
function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function entityFor(m) {
  let e = entities.get(m.key);
  if (e) return e;
  const model =
    m.kind === "drone" ? makeDrone() : m.kind === "ugv" ? makeUgv() : m.kind === "device" ? makeC2() : makeAgent();
  model.group.scale.setScalar(model.scale);
  scene.add(model.group);

  const marker = new THREE.Mesh(new THREE.RingGeometry(5, 6.6, 32), additive(C.fleet, 0.55, { side: THREE.DoubleSide }));
  marker.rotation.x = -Math.PI / 2;
  scene.add(marker);
  const tether = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: C.fleet, transparent: true, opacity: 0.25 })
  );
  scene.add(tether);

  const div = document.createElement("div");
  div.className = "lbl" + (m.spotlight ? " spot" : "");
  const label = new CSS2DObject(div);
  label.position.y = m.kind === "openclaw" ? 30 : m.kind === "device" ? 48 : 13;
  model.group.add(label);

  e = {
    key: m.key,
    kind: m.kind,
    spotlight: m.spotlight,
    model,
    marker,
    tether,
    div,
    pos: new THREE.Vector3(),
    target: new THREE.Vector3(),
    heading: 0,
    phase: (hash(m.key) % 100) / 16,
    lift: 40 + (hash(m.key) % 5) * 5,
    color: new THREE.Color(C.fleet),
    placed: false,
    status: "",
    flight: "ground",
  };
  entities.set(m.key, e);
  return e;
}

// ─── The spotlight drone and the third party ───────────────────────────────────

const spot = {
  column: new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 520, 16, 1, true), additive(C.warn, 0.1, { side: THREE.DoubleSide })),
  ring: new THREE.Mesh(new THREE.RingGeometry(16, 18, 6, 1), additive(C.warn, 0.7, { side: THREE.DoubleSide })),
  bubble: new THREE.Mesh(new THREE.IcosahedronGeometry(26, 2), new THREE.MeshBasicMaterial({ color: C.deny, wireframe: true, transparent: true, opacity: 0.6 })),
  bubbleFill: new THREE.Mesh(new THREE.SphereGeometry(25, 32, 16), additive(C.deny, 0.07)),
};
spot.ring.rotation.x = -Math.PI / 2;
for (const o of Object.values(spot)) {
  o.visible = false;
  scene.add(o);
}

const ATTACKER = { activity: "listen", pos: GROUND(1000, 34), key: "tiers-radio" };
const attackerTop = ATTACKER.pos.clone().setY(86);
{
  const g = new THREE.Group();
  g.position.copy(ATTACKER.pos);
  const lattice = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 7, 80, 4, 8, true), new THREE.MeshBasicMaterial({ color: C.deny, wireframe: true }));
  lattice.position.y = 40;
  g.add(lattice);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshBasicMaterial({ color: C.deny, wireframe: true }));
  dish.position.y = 74;
  dish.rotation.z = Math.PI / 3;
  g.add(dish);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: C.deny }));
  tip.position.y = 86;
  g.add(tip);
  const pad = new THREE.Mesh(new THREE.RingGeometry(14, 18, 4), additive(C.deny, 0.5, { side: THREE.DoubleSide }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.5;
  g.add(pad);
  ATTACKER.light = new THREE.PointLight(C.deny, 600, 320);
  ATTACKER.light.position.y = 86;
  g.add(ATTACKER.light);
  ATTACKER.dish = dish;
  ATTACKER.tip = tip;
  const div = document.createElement("div");
  div.className = "lbl threat";
  const label = new CSS2DObject(div);
  label.position.y = 112;
  g.add(label);
  ATTACKER.div = div;
  scene.add(g);
}

/** Red emitter particles riding the hijack link from the mast to RAPACE-07. */
const hijack = {
  line: new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(32).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: C.deny, transparent: true, opacity: 0.55 })),
  sparks: new Array(7).fill(0).map(() => glowSprite(C.deny, 11)),
};
hijack.line.visible = false;
scene.add(hijack.line);
for (const s of hijack.sparks) {
  s.visible = false;
  scene.add(s);
}

// ─── Packets and effects ───────────────────────────────────────────────────────

const packets = [];
const effects = [];
const seenLinks = new Set();
let primed = false;

function anchor(key, out) {
  if (key === ATTACKER.key) return out.copy(attackerTop);
  const e = entities.get(key);
  if (!e) return null;
  return out.copy(e.model.group.position).add(new THREE.Vector3(0, e.kind === "device" ? 50 : e.kind === "ugv" ? 10 : 3, 0));
}

function curvePoint(a, b, t, out) {
  const lift = Math.min(160, a.distanceTo(b) * 0.28 + 18);
  const mid = a.clone().lerp(b, 0.5).setY(Math.max(a.y, b.y) + lift);
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * mid.x + t * t * b.x,
    u * u * a.y + 2 * u * t * mid.y + t * t * b.y,
    u * u * a.z + 2 * u * t * mid.z + t * t * b.z
  );
}

function spawnPacket(link, delay) {
  const hostile = link.from === ATTACKER.key;
  const color = hostile ? C.deny : link.ok ? C.ok : C.deny;
  const head = glowSprite(color, hostile ? 20 : 14);
  head.visible = false;
  scene.add(head);
  const trail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(new Array(14).fill(0).map(() => new THREE.Vector3())),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: hostile ? 0.95 : 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  trail.visible = false;
  scene.add(trail);
  packets.push({ link, hostile, head, trail, t: -delay, dur: hostile ? 1.15 : 0.85, stop: link.ok ? 1 : 0.86 });
}

const A = new THREE.Vector3();
const B = new THREE.Vector3();
const P = new THREE.Vector3();
function updatePackets(dt) {
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i];
    p.t += dt;
    if (p.t < 0) continue;
    if (!anchor(p.link.from, A) || !anchor(p.link.to, B)) {
      dispose(p.head, p.trail);
      packets.splice(i, 1);
      continue;
    }
    const prog = Math.min(p.stop, p.t / p.dur);
    p.head.visible = p.trail.visible = true;
    curvePoint(A, B, prog, p.head.position);
    const attr = p.trail.geometry.attributes.position;
    const from = Math.max(0, prog - 0.32);
    for (let k = 0; k < attr.count; k++) {
      curvePoint(A, B, from + ((prog - from) * k) / (attr.count - 1), P);
      attr.setXYZ(k, P.x, P.y, P.z);
    }
    attr.needsUpdate = true;
    if (p.t / p.dur >= p.stop) {
      const at = p.head.position.clone();
      if (p.link.ok) flash(B.clone(), C.ok, 14);
      else {
        burst(at);
        if (p.hostile) shield(B.clone());
      }
      dispose(p.head, p.trail);
      packets.splice(i, 1);
    }
  }
}

function dispose(...objs) {
  for (const o of objs) {
    scene.remove(o);
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  }
}

function effect(obj, dur, step) {
  scene.add(obj);
  effects.push({ obj, t: 0, dur, step });
}
/** An accepted delivery: a short green ripple at the recipient. */
function flash(at, color, size) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32), additive(color, 0.9, { side: THREE.DoubleSide }));
  ring.position.copy(at);
  ring.lookAt(camera.position);
  effect(ring, 0.5, (o, k) => {
    o.scale.setScalar(size * (0.4 + k));
    o.material.opacity = 0.9 * (1 - k);
  });
}
/** A refusal: the packet dies short of its target with a red ✕. */
function burst(at) {
  const s = glowSprite(C.deny, 26);
  s.position.copy(at);
  effect(s, 0.45, (o, k) => {
    o.scale.setScalar(26 + 40 * k);
    o.material.opacity = 1 - k;
  });
  const x = new THREE.Sprite(new THREE.SpriteMaterial({ map: CROSS, transparent: true, depthWrite: false }));
  x.position.copy(at);
  effect(x, 1.4, (o, k) => {
    o.position.y = at.y + 6 + k * 22;
    o.scale.setScalar(14 + Math.min(1, k * 5) * 6);
    o.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
  });
}
/** The recipient's checks, drawn: a cryptographic shield flaring around the drone it protects. */
function shield(at) {
  const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: C.shield, wireframe: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  sh.position.copy(at);
  effect(sh, 0.9, (o, k) => {
    o.scale.setScalar(16 + 10 * Math.sin(k * Math.PI * 0.5));
    o.rotation.y += 0.05;
    o.material.opacity = 1 - k;
  });
}
/** The mast's emission, while the third party is transmitting. */
function wave() {
  const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 64), additive(C.deny, 0.8));
  w.position.copy(attackerTop);
  w.rotation.x = Math.PI / 2;
  effect(w, 1.6, (o, k) => {
    o.scale.setScalar(6 + 110 * k);
    o.position.y = attackerTop.y - 30 * k;
    o.material.opacity = 0.8 * (1 - k);
  });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const f = effects[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    f.step(f.obj, k);
    if (k >= 1) {
      dispose(f.obj);
      effects.splice(i, 1);
    }
  }
}

// ─── State in ──────────────────────────────────────────────────────────────────

const ACTIVITY = { listen: "écoute le lien radio", inject: "injecte des ordres", control: "contrôle RAPACE-07", cut: "coupé de la flotte" };
const BAD = new Set(["révoqué", "isolé"]);
let spotlightKey = null;

window.addEventListener("fleet-state", (ev) => {
  const s = ev.detail;
  let ai = 0;
  for (const m of s.members) {
    const e = entityFor(m);
    const p = m.position ?? { x: AI_X, y: 200 + ai++ * 170 };
    e.flight = m.flight;
    const alt =
      m.kind === "openclaw" ? 120 : m.kind === "drone" ? (m.flight === "patrol" ? e.lift : m.flight === "airborne" ? 30 : 2) : 0;
    e.target.copy(GROUND(p.x, p.y)).setY(alt);
    if (!e.placed) {
      e.pos.copy(e.target);
      e.placed = true;
    }
    e.status = m.status;
    e.spotlight = m.spotlight;
    const hijacked = m.spotlight && s.attacker.activity === "control";
    const color = BAD.has(m.status)
      ? C.deny
      : hijacked
        ? C.hijack
        : m.status !== "certifié"
          ? C.warn
          : m.kind === "openclaw"
            ? C.ai
            : C.fleet;
    e.color.setHex(color);
    e.hijacked = hijacked;
    const text = m.label + (BAD.has(m.status) ? ` · ${m.status.toUpperCase()}` : hijacked ? " · COMPROMIS" : "");
    if (e.div.textContent !== text) e.div.textContent = text;
    e.div.classList.toggle("bad", BAD.has(m.status));
    e.div.classList.toggle("hijacked", hijacked);
    if (m.spotlight) spotlightKey = m.key;
  }

  ATTACKER.activity = s.attacker.activity;
  const atk = `TIERS · LIEN RADIO<br><span>${ACTIVITY[s.attacker.activity]}</span>`;
  if (ATTACKER.div.innerHTML !== atk) ATTACKER.div.innerHTML = atk;

  // The first state only marks what is already in flight; replaying it would fire a volley of
  // packets that all happened before the page opened.
  const batch = s.links.filter((l) => !seenLinks.has(`${l.from}|${l.to}|${l.at}|${l.type}`));
  for (const l of batch) seenLinks.add(`${l.from}|${l.to}|${l.at}|${l.type}`);
  if (seenLinks.size > 4000) seenLinks.clear();
  if (!primed) {
    primed = true;
    return;
  }
  const first = Math.min(...batch.map((l) => l.at));
  for (const l of batch) spawnPacket(l, Math.min(0.9, (l.at - first) / 1000));
});

// ─── Frame loop ────────────────────────────────────────────────────────────────

const clock = new THREE.Clock();
let intro = 0;
let follow = false;
let waveClock = 0;
const tmp = new THREE.Vector3();

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  fenceUniforms.time.value = t;
  radarUniforms.time.value = t;
  dust.rotation.y = t * 0.01;

  if (intro < 1) {
    intro = Math.min(1, intro + dt / 3.2);
    const k = 1 - Math.pow(1 - intro, 3);
    camera.position.lerpVectors(new THREE.Vector3(0, 1500, 1900), HOME_CAMERA, k);
    camera.lookAt(HOME_TARGET);
    if (intro >= 1) controls.enabled = true;
  }

  for (const e of entities.values()) {
    e.pos.lerp(e.target, 1 - Math.exp(-dt * 3));
    const g = e.model.group;
    const prev = tmp.copy(g.position);
    g.position.copy(e.pos);
    const airborne = e.kind === "drone" && e.flight !== "ground";
    if (airborne) g.position.y += Math.sin(t * 2 + e.phase) * 1.6;
    if (e.kind === "openclaw") {
      g.position.y += Math.sin(t * 1.3 + e.phase) * 3;
      e.model.shell.rotation.y += dt * 0.6;
      e.model.shell.rotation.x += dt * 0.25;
      e.model.orbit.rotation.z += dt * 0.9;
    }
    const moved = g.position.clone().sub(prev).setY(0);
    if ((e.kind === "drone" || e.kind === "ugv") && moved.lengthSq() > 0.0004) {
      const want = Math.atan2(-moved.z, moved.x);
      let d = want - e.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      e.heading += d * Math.min(1, dt * 4);
      g.rotation.y = e.heading;
      if (e.kind === "drone") g.rotation.z = Math.min(0.25, moved.length() * 0.6);
    }
    // Colour: a compromised drone flickers like a bad signal.
    const flicker = e.hijacked ? (Math.sin(t * 23) > 0.3 ? 1 : 0.35) : 1;
    e.model.accent.color.copy(e.color).multiplyScalar(flicker);
    if (e.model.rotors) {
      for (const r of e.model.rotors) {
        r.blade.rotation.y += dt * (airborne ? 40 : 3);
        r.disc.material.color.copy(e.color);
        r.disc.material.opacity = airborne ? 0.2 : 0.04;
      }
      e.model.beam.visible = airborne && !BAD.has(e.status);
      e.model.beam.material.color.copy(e.color);
    }
    if (e.model.beacon) e.model.beacon.scale.setScalar(1 + 0.35 * Math.sin(t * 4));
    if (e.model.core) e.model.core.scale.setScalar(1 + 0.12 * Math.sin(t * 3 + e.phase));

    e.marker.visible = e.kind !== "openclaw";
    e.marker.position.set(g.position.x, 0.6, g.position.z);
    e.marker.material.color.copy(e.color);
    e.marker.scale.setScalar(e.spotlight ? 1.6 : 1);
    const tp = e.tether.geometry.attributes.position;
    tp.setXYZ(0, g.position.x, 0.6, g.position.z);
    tp.setXYZ(1, g.position.x, g.position.y, g.position.z);
    tp.needsUpdate = true;
    e.tether.visible = airborne;
    e.tether.material.color.copy(e.color);
  }

  // The spotlight: a column of light, a turning hexagon underneath, and a quarantine bubble once
  // the fleet has stopped trusting it.
  const sp = spotlightKey && entities.get(spotlightKey);
  if (sp) {
    const at = sp.model.group.position;
    const bad = BAD.has(sp.status);
    const col = bad ? C.deny : sp.hijacked ? C.hijack : C.warn;
    spot.column.visible = spot.ring.visible = true;
    spot.column.position.set(at.x, 260, at.z);
    spot.column.material.color.setHex(col);
    spot.column.material.opacity = 0.08 + 0.04 * Math.sin(t * 3);
    spot.ring.position.set(at.x, 0.8, at.z);
    spot.ring.rotation.z = t * 0.8;
    spot.ring.material.color.setHex(col);
    spot.bubble.visible = spot.bubbleFill.visible = bad;
    if (bad) {
      spot.bubble.position.copy(at);
      spot.bubbleFill.position.copy(at);
      spot.bubble.rotation.y = t * 0.4;
      spot.bubble.rotation.x = t * 0.2;
      const pulse = 1 + 0.06 * Math.sin(t * 4);
      spot.bubble.scale.setScalar(pulse);
      spot.bubbleFill.scale.setScalar(pulse);
    }
  }

  // The third party: the mast transmits while it attacks, and rides RAPACE-07 while it holds it.
  const hot = ATTACKER.activity === "inject" || ATTACKER.activity === "control";
  ATTACKER.dish.rotation.y += dt * (hot ? 2.2 : 0.3);
  ATTACKER.light.intensity = hot ? 500 + 400 * Math.sin(t * 9) : 120;
  ATTACKER.tip.scale.setScalar(hot ? 1 + 0.4 * Math.sin(t * 9) : 1);
  waveClock += dt;
  if (waveClock > (hot ? 0.45 : 2.4)) {
    waveClock = 0;
    if (!reducedMotion || hot) wave();
  }
  const riding = ATTACKER.activity === "control" && sp;
  hijack.line.visible = Boolean(riding);
  for (const s of hijack.sparks) s.visible = Boolean(riding);
  if (riding) {
    anchor(spotlightKey, B);
    const attr = hijack.line.geometry.attributes.position;
    for (let k = 0; k < attr.count; k++) {
      curvePoint(attackerTop, B, k / (attr.count - 1), P);
      attr.setXYZ(k, P.x, P.y, P.z);
    }
    attr.needsUpdate = true;
    hijack.sparks.forEach((s, i) => curvePoint(attackerTop, B, (t * 0.6 + i / hijack.sparks.length) % 1, s.position));
  }

  updatePackets(dt);
  updateEffects(dt);

  if (follow && sp) controls.target.lerp(sp.model.group.position, 1 - Math.exp(-dt * 2.5));
  controls.update();
  composer.render();
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const w = host.clientWidth;
  const h = host.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();
requestAnimationFrame(frame);

// ─── Presenter controls ────────────────────────────────────────────────────────

const orbitBtn = document.getElementById("view-orbit");
const followBtn = document.getElementById("view-follow");
const resetBtn = document.getElementById("view-reset");
controls.autoRotate = !reducedMotion;
orbitBtn.classList.toggle("on", controls.autoRotate);
orbitBtn.onclick = () => {
  controls.autoRotate = !controls.autoRotate;
  orbitBtn.classList.toggle("on", controls.autoRotate);
};
followBtn.onclick = () => {
  follow = !follow;
  followBtn.classList.toggle("on", follow);
  if (follow) controls.minDistance = 120;
};
resetBtn.onclick = () => {
  follow = false;
  followBtn.classList.remove("on");
  controls.target.copy(HOME_TARGET);
  camera.position.copy(HOME_CAMERA);
};
