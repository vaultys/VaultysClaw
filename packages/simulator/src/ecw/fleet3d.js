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

// Deterministic terrain: every viewer, and every reload, sees the same valley.
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum / (1 - Math.pow(0.5, octaves));
}
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const BASE_XZ = GROUND(500, 560);
const WATER_LEVEL = -12;

/** Ground height at world (X, Z): rolling hills inside the zone, a ridge of mountains around it,
 *  a lake to the west, and a levelled pad under the base so the C2 sits flat. */
function terrainHeight(X, Z) {
  const hills = (fbm(X * 0.0045 + 11, Z * 0.0045 - 7) - 0.5) * 56;
  const ridge = 1 - Math.abs(fbm(X * 0.0021 + 3, Z * 0.0021 + 5) * 2 - 1);
  const outside = smoothstep(430, 860, Math.hypot(X / 1.3, Z - 10));
  let h = hills * (0.55 + outside * 0.9) + outside * Math.pow(ridge, 2.4) * 300;
  h -= smoothstep(280, 70, Math.hypot(X + 780, Z + 40)) * 60;
  return h + (2 - h) * smoothstep(150, 70, Math.hypot(X - BASE_XZ.x, Z - BASE_XZ.z));
}

{
  const W = 2600;
  const D = 1900;
  const geo = new THREE.PlaneGeometry(W, D, 260, 190);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const PAL = {
    shore: new THREE.Color(0x5b5643),
    meadow: new THREE.Color(0x40552f),
    grass: new THREE.Color(0x33472a),
    forest: new THREE.Color(0x24361f),
    rock: new THREE.Color(0x5d5a54),
    high: new THREE.Color(0x7c7871),
    snow: new THREE.Color(0xaab4bf),
  };
  for (let i = 0; i < pos.count; i++) {
    const X = pos.getX(i);
    const Z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - nrm.getY(i);
    const detail = fbm(X * 0.03, Z * 0.03, 3);
    col.copy(PAL.meadow).lerp(PAL.grass, smoothstep(0.35, 0.65, detail));
    col.lerp(PAL.forest, smoothstep(0.5, 0.62, fbm(X * 0.006 + 40, Z * 0.006, 3)) * 0.85);
    col.lerp(PAL.shore, smoothstep(WATER_LEVEL + 6, WATER_LEVEL, h));
    col.lerp(PAL.rock, smoothstep(0.12, 0.3, slope) * 0.9);
    col.lerp(PAL.high, smoothstep(90, 170, h) * 0.8);
    col.lerp(PAL.snow, smoothstep(185, 230, h + detail * 30) * (1 - smoothstep(0.3, 0.5, slope)));
    col.multiplyScalar(0.85 + detail * 0.3);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // The tactical layer is painted onto the ground itself — a faint grid and the C2's range rings —
  // so it follows the relief instead of floating over it.
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uC2 = { value: new THREE.Vector2(BASE_XZ.x, BASE_XZ.z) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nuniform vec2 uC2;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec2 gc = vWorld.xz / 40.0;
        vec2 gl = abs(fract(gc - 0.5) - 0.5) / fwidth(gc);
        float grid = 1.0 - min(min(gl.x, gl.y), 1.0);
        totalEmissiveRadiance += vec3(0.12, 0.42, 0.6) * grid * 0.07;
        vec2 rp = vWorld.xz - uC2;
        float r = length(rp) / 400.0;
        if (r < 1.0) {
          float rings = smoothstep(0.014, 0.0, abs(fract(r * 4.0) - 0.5) - 0.486);
          totalEmissiveRadiance += vec3(0.22, 0.74, 0.97) * rings * 0.08 * (1.0 - r);
        }`
      );
  };
  scene.add(new THREE.Mesh(geo, mat));

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0x0c2a3b, roughness: 0.12, metalness: 0.65, transparent: true, opacity: 0.88 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  scene.add(water);

  // Forests: instanced conifers where the forest mask, slope and altitude allow, kept off the
  // base pad and thinned inside the zone so the fleet stays readable.
  let seed = 1337;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const N = 2600;
  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    N
  );
  const m4 = new THREE.Matrix4();
  const tint = new THREE.Color();
  let placed = 0;
  for (let tries = 0; placed < N && tries < N * 30; tries++) {
    const X = (rand() - 0.5) * W * 0.92;
    const Z = (rand() - 0.5) * D * 0.92;
    const h = terrainHeight(X, Z);
    if (h < WATER_LEVEL + 3 || h > 150) continue;
    const slope = Math.abs(terrainHeight(X + 6, Z) - h) + Math.abs(terrainHeight(X, Z + 6) - h);
    if (slope > 7) continue;
    if (Math.hypot(X - BASE_XZ.x, Z - BASE_XZ.z) < 170) continue;
    const inZone = X > -490 && X < 480 && Z > -270 && Z < 290;
    if (fbm(X * 0.006 + 40, Z * 0.006, 3) < (inZone ? 0.62 : 0.5)) continue;
    const s = 3.5 + rand() * 3;
    const tall = 11 + rand() * 12;
    m4.makeScale(s, tall, s).setPosition(X, h - 0.5, Z);
    trees.setMatrixAt(placed, m4);
    trees.setColorAt(placed, tint.setHSL(0.3 + rand() * 0.06, 0.35, 0.14 + rand() * 0.08));
    placed++;
  }
  trees.count = placed;
  scene.add(trees);
}

// Ambient "data dust" drifting above the field.
const dust = (() => {
  const n = 700;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 1800;
    pos[i * 3 + 1] = 60 + Math.random() * 320;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 1300;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0x3fa9d6, size: 2.2, map: GLOW, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  scene.add(pts);
  return pts;
})();

/** The geofence: a glowing curtain along the authorised zone's rounded rectangle, standing on
 *  the relief (the path is subdivided so it follows hills instead of cutting through them). */
const fenceUniforms = { time: { value: 0 }, color: { value: new THREE.Color(C.fleet) } };
{
  const [x0, z0, x1, z1, r] = [-480, -260, 470, 280, 22];
  const corners = [];
  const corner = (cx, cz, a0) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (i / 8) * (Math.PI / 2);
      corners.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
  };
  corner(x1 - r, z0 + r, -Math.PI / 2);
  corner(x1 - r, z1 - r, 0);
  corner(x0 + r, z1 - r, Math.PI / 2);
  corner(x0 + r, z0 + r, Math.PI);
  corners.push(corners[0].clone());
  const path = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const steps = Math.max(1, Math.ceil(corners[i].distanceTo(corners[i + 1]) / 10));
    for (let k = 0; k < steps; k++) path.push(corners[i].clone().lerp(corners[i + 1], k / steps));
  }
  path.push(path[0].clone());
  const H = 46;
  const pos = [];
  const uv = [];
  let along = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ha = terrainHeight(a.x, a.y);
    const hb = terrainHeight(b.x, b.y);
    const len = a.distanceTo(b);
    const u0 = along / 40;
    const u1 = (along + len) / 40;
    along += len;
    pos.push(a.x, ha, a.y, b.x, hb, b.y, b.x, hb + H, b.y, a.x, ha, a.y, b.x, hb + H, b.y, a.x, ha + H, a.y);
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
          float base = pow(1.0 - vUv.y, 2.2) * 0.07;
          float scan = exp(-pow((vUv.y - fract(time * 0.22)) * 14.0, 2.0)) * 0.1 * (1.0 - vUv.y);
          float ribs = smoothstep(0.96, 1.0, fract(vUv.x)) * 0.07 * (1.0 - vUv.y);
          gl_FragColor = vec4(color, base + scan + ribs);
        }`,
    })
  );
  scene.add(curtain);
  const edge = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(path.map((p) => new THREE.Vector3(p.x, terrainHeight(p.x, p.y) + 0.8, p.y))),
    new THREE.LineBasicMaterial({ color: C.fleet, transparent: true, opacity: 0.2 })
  );
  scene.add(edge);
  const tag = document.createElement("div");
  tag.className = "lbl zone";
  tag.textContent = "ZONE AUTORISÉE · GÉORÉPERAGE";
  const o = new CSS2DObject(tag);
  o.position.set(x0 + 150, terrainHeight(x0 + 150, z0) + 54, z0);
  scene.add(o);
}

/** The base pad under the C2. */
{
  const base = new THREE.Mesh(new THREE.RingGeometry(40, 46, 64), additive(C.fleet, 0.35, { side: THREE.DoubleSide }));
  base.rotation.x = -Math.PI / 2;
  base.position.copy(BASE_XZ).setY(2.6);
  scene.add(base);
}

/** Where the AI agents live: processes, not places — a floating platform off the map, high above
 *  the ridge. */
const AI_ALT = 190;
{
  const deck = new THREE.Mesh(new THREE.BoxGeometry(150, 2, 520), additive(C.ai, 0.06));
  deck.position.set(AI_X - 520, AI_ALT - 24, -40);
  scene.add(deck);
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(150, 2, 520)), new THREE.LineBasicMaterial({ color: C.ai, transparent: true, opacity: 0.6 }));
  rim.position.copy(deck.position);
  scene.add(rim);
  const tag = document.createElement("div");
  tag.className = "lbl zone ai";
  tag.innerHTML = "AGENTS IA<br><span>processus, hors carte</span>";
  const o = new CSS2DObject(tag);
  o.position.set(AI_X - 520, AI_ALT + 10, -300);
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

/**
 * The field pilot: a soldier in fatigues holding the terminal, a radio pack and whip antenna on the
 * back. Built facing +X (the convention every model here uses for its heading), roughly human
 * proportions at ~17 units tall before scaling. `parts` are the bits the frame loop animates.
 */
function makePilot() {
  const g = new THREE.Group();
  const accent = new THREE.MeshBasicMaterial({ color: C.fleet });
  const uniform = new THREE.MeshStandardMaterial({ color: 0x4a5a3c, roughness: 0.85 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x2f3a28, roughness: 0.8 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc8956d, roughness: 0.7 });
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // Legs, slightly apart, boots forward.
  for (const z of [-1.1, 1.1]) {
    add(g, new THREE.CapsuleGeometry(0.75, 3.4, 4, 10), uniform, 0, 2.6, z);
    add(g, new THREE.CapsuleGeometry(0.72, 2.4, 4, 10), uniform, 0.1, 5.6, z);
    add(g, new THREE.BoxGeometry(2.1, 0.9, 1.2), boots, 0.45, 0.45, z);
  }
  add(g, new THREE.BoxGeometry(1.9, 1.2, 3.2), gear, 0, 7.4, 0); // belt

  // Torso and head, on their own group so the body can breathe and the head can turn.
  const upper = new THREE.Group();
  upper.position.y = 7.6;
  g.add(upper);
  const chest = add(upper, new THREE.CapsuleGeometry(1.5, 2.6, 4, 12), uniform, 0, 2.4, 0);
  chest.scale.set(0.85, 1, 1.3);
  add(upper, new THREE.BoxGeometry(1.8, 2.6, 3.4), gear, 0.35, 2.4, 0); // plate carrier
  add(upper, new THREE.CylinderGeometry(0.45, 0.5, 0.8, 10), skin, 0, 5.1, 0); // neck

  const head = new THREE.Group();
  head.position.y = 6.2;
  upper.add(head);
  add(head, new THREE.SphereGeometry(1.1, 16, 12), skin, 0.05, 0, 0);
  const helmet = add(head, new THREE.SphereGeometry(1.35, 18, 10, 0, Math.PI * 2, 0, Math.PI / 1.85), gear, -0.05, 0.15, 0);
  helmet.scale.set(1.05, 0.95, 1);
  add(head, new THREE.BoxGeometry(0.25, 0.45, 1.6), accent, 1.12, 0.05, 0); // visor / goggles

  // Radio pack and whip antenna on the back.
  add(upper, new THREE.BoxGeometry(1.4, 2.8, 2.4), gear, -1.55, 2.5, 0);
  add(upper, new THREE.CylinderGeometry(0.07, 0.1, 9, 6), boots, -1.9, 8.2, -0.8);
  const tip = add(upper, new THREE.SphereGeometry(0.35, 10, 8), accent, -1.9, 12.7, -0.8);

  // Arms: both bent forward at the elbow, hands meeting on the terminal at chest height.
  const arm = (z, side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0, 3.9, z);
    upper.add(shoulder);
    const upperArm = add(shoulder, new THREE.CapsuleGeometry(0.5, 2.1, 4, 8), uniform, 0, -1.4, 0);
    upperArm.rotation.x = side * 0.12;
    const elbow = new THREE.Group();
    elbow.position.set(0, -2.7, 0);
    elbow.rotation.z = 1.25; // forearm forward, slightly down
    shoulder.add(elbow);
    add(elbow, new THREE.CapsuleGeometry(0.45, 1.9, 4, 8), uniform, 0, -1.2, 0);
    add(elbow, new THREE.SphereGeometry(0.5, 10, 8), skin, 0, -2.5, 0); // hand
    return shoulder;
  };
  arm(-1.75, -1);
  arm(1.75, 1);

  // The terminal, held in front, screen lit in the status colour.
  const terminal = new THREE.Group();
  terminal.position.set(2.55, 0.95, 0);
  terminal.rotation.z = 1.2; // screen tilted up, readable from above
  upper.add(terminal);
  add(terminal, new THREE.BoxGeometry(0.35, 1.9, 2.6), boots, 0, 0, 0);
  const screen = add(terminal, new THREE.PlaneGeometry(2.2, 1.5), accent, 0.19, 0, 0);
  screen.rotation.y = Math.PI / 2;

  return { group: g, accent, scale: 1.8, parts: { upper, head, tip } };
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
    m.kind === "drone"
      ? makeDrone()
      : m.kind === "ugv"
        ? makeUgv()
        : m.key === "pilote"
          ? makePilot()
          : m.kind === "device"
            ? makeC2()
            : makeAgent();
  model.group.scale.setScalar(model.scale);
  // Every solid material of the model, so "Suivre RAPACE-07" can fade it. Rotor discs and the scan
  // beam set their own opacity each frame and are faded where they do.
  const dynamic = new Set([model.beam?.material, ...(model.rotors ?? []).map((r) => r.disc.material)]);
  const solids = new Set();
  model.group.traverse((o) => o.material && !dynamic.has(o.material) && solids.add(o.material));
  for (const mat of solids) {
    mat.userData.baseOpacity = mat.opacity;
    mat.transparent = true;
  }
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
  label.position.y = m.kind === "openclaw" ? 30 : m.key === "pilote" ? 25 : m.kind === "device" ? 48 : 13;
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
    /** Recent server positions ({t, x, z}), replayed a little in the past — see `sampleAt`. */
    samples: [],
    lift: 0,
    liftNow: 0,
    heading: 0,
    phase: (hash(m.key) % 100) / 16,
    cruise: 40 + (hash(m.key) % 5) * 5,
    color: new THREE.Color(C.fleet),
    placed: false,
    status: "",
    flight: "ground",
    solids: [...solids],
    /** 1 = normal, lower = faded behind the spotlight drone while the camera follows it. */
    dim: 1,
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
ATTACKER.pos.y = terrainHeight(ATTACKER.pos.x, ATTACKER.pos.z);
const attackerTop = ATTACKER.pos.clone().add(new THREE.Vector3(0, 86, 0));
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

/** The hijack link from the mast to RAPACE-07, pulsing while the third party holds the drone. */
const hijack = {
  line: new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(32).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: C.deny, transparent: true, opacity: 0.55 })),
};
hijack.line.visible = false;
scene.add(hijack.line);

// ─── Packets and effects ───────────────────────────────────────────────────────

const packets = [];
/** "Seulement RAPACE-07": draw only the traffic the spotlight drone sends or receives. */
let focus = false;
const involvesSpotlight = (link) => link.from === spotlightKey || link.to === spotlightKey;
const effects = [];
const seenLinks = new Set();
let primed = false;

function anchor(key, out) {
  if (key === ATTACKER.key) return out.copy(attackerTop);
  const e = entities.get(key);
  if (!e) return null;
  const up = e.key === "pilote" ? 32 : e.kind === "device" ? 50 : e.kind === "ugv" ? 10 : 3;
  return out.copy(e.model.group.position).add(new THREE.Vector3(0, up, 0));
}

function curvePoint(a, b, t, out, minLift = 18) {
  const lift = Math.max(minLift, Math.min(160, a.distanceTo(b) * 0.28 + 18));
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
  // Orders (from the C2 or the third party) are the story of the demo: drawn as a whole, higher
  // arc that lingers, where peer chatter is a short comet.
  const order = link.type === "command";
  const color = hostile ? C.deny : link.ok ? C.ok : C.deny;
  const trail = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(new Array(order ? 40 : 14).fill(0).map(() => new THREE.Vector3())),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: order ? 0.95 : 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  trail.visible = false;
  scene.add(trail);
  packets.push({ link, hostile, order, tip: new THREE.Vector3(), trail, t: -delay, dur: order ? 1.4 : 0.85, stop: link.blocked ? 0.45 : 1 });
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
      dispose(p.trail);
      packets.splice(i, 1);
      continue;
    }
    const prog = Math.min(p.stop, p.t / p.dur);
    p.trail.visible = true;
    const lift = p.order ? 70 : 18;
    curvePoint(A, B, prog, p.tip, lift);
    const attr = p.trail.geometry.attributes.position;
    const from = p.order ? 0 : Math.max(0, prog - 0.32);
    for (let k = 0; k < attr.count; k++) {
      curvePoint(A, B, from + ((prog - from) * k) / (attr.count - 1), P, lift);
      attr.setXYZ(k, P.x, P.y, P.z);
    }
    attr.needsUpdate = true;
    if (p.t / p.dur >= p.stop) {
      // A refusal at the recipient is drawn on the recipient; only a message its sender's own
      // certificate held back dies on the way, where it stopped.
      const at = p.link.blocked ? p.tip.clone() : B.clone().add(new THREE.Vector3(0, 10, 0));
      if (!p.link.ok) {
        burst(at);
        if (p.hostile) shield(B.clone());
      }
      if (p.order) {
        // Leave the order's path on screen a moment, so the audience sees where it came from.
        const opacity = p.trail.material.opacity;
        effect(p.trail, 1.6, (o, k) => (o.material.opacity = opacity * (1 - k * k)));
      } else dispose(p.trail);
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

/**
 * Motion. The page polls the presenter a few times a second; drawing each answer as it arrives
 * makes everything jump. Instead every engine keeps its last few server positions and is drawn
 * `INTERP_DELAY` in the past, on a Catmull-Rom curve through them — so it always has a sample on
 * each side of the moment it is drawing. A speed limit turns a jump (take-off, return to base)
 * into a flight, and altitude eases towards its target.
 */
const INTERP_DELAY = 900;
const MAX_SPEED = 90;
let serverOffset = null;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleAt(e, at) {
  const S = e.samples;
  if (S.length === 1 || at <= S[0].t) return S[0];
  for (let i = 0; i < S.length - 1; i++) {
    if (at > S[i + 1].t) continue;
    const k = (at - S[i].t) / Math.max(1, S[i + 1].t - S[i].t);
    const a = S[Math.max(0, i - 1)];
    const d = S[Math.min(S.length - 1, i + 2)];
    return { x: catmull(a.x, S[i].x, S[i + 1].x, d.x, k), z: catmull(a.z, S[i].z, S[i + 1].z, d.z, k) };
  }
  return S[S.length - 1];
}

window.addEventListener("fleet-state", (ev) => {
  const s = ev.detail;
  const offset = s.now - Date.now();
  serverOffset = serverOffset === null ? offset : serverOffset * 0.9 + offset * 0.1;
  let ai = 0;
  for (const m of s.members) {
    const e = entityFor(m);
    const p = m.position ?? { x: AI_X, y: 200 + ai++ * 170 };
    e.flight = m.flight;
    e.lift = m.kind === "drone" ? (m.flight === "patrol" ? e.cruise : m.flight === "airborne" ? 30 : 2) : 0;
    const g = GROUND(p.x, p.y);
    e.samples.push({ t: s.now, x: g.x, z: g.z });
    if (e.samples.length > 10) e.samples.shift();
    if (!e.placed) {
      e.pos.set(g.x, 0, g.z);
      e.liftNow = e.lift;
      e.placed = true;
    }
    e.status = m.status;
    e.spotlight = m.spotlight;
    const hijacked = m.key === s.attacker.target && s.attacker.activity === "control";
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
    const text =
      m.label + (BAD.has(m.status) ? ` · ${m.status.toUpperCase()}` : hijacked ? " · COMPROMIS" : m.enrolling ? " · EN ATTENTE D'ENRÔLEMENT" : "");
    if (e.div.textContent !== text) e.div.textContent = text;
    e.div.classList.toggle("bad", BAD.has(m.status));
    e.div.classList.toggle("hijacked", hijacked);
    if (m.spotlight) spotlightKey = m.key;
  }

  ATTACKER.activity = s.attacker.activity;
  ATTACKER.target = s.attacker.target;
  const held = s.attacker.target && s.members.find((m) => m.key === s.attacker.target);
  const doing = s.attacker.activity === "control" && held ? `contrôle ${held.label}` : ACTIVITY[s.attacker.activity];
  const atk = `TIERS · LIEN RADIO<br><span>${doing}</span>`;
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
  for (const l of batch) {
    if (focus && !involvesSpotlight(l)) continue;
    spawnPacket(l, Math.min(0.9, (l.at - first) / 1000));
  }
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
  dust.rotation.y = t * 0.01;

  if (intro < 1) {
    intro = Math.min(1, intro + dt / 3.2);
    const k = 1 - Math.pow(1 - intro, 3);
    camera.position.lerpVectors(new THREE.Vector3(0, 1500, 1900), HOME_CAMERA, k);
    camera.lookAt(HOME_TARGET);
    if (intro >= 1) controls.enabled = true;
  }

  const renderAt = Date.now() + (serverOffset ?? 0) - INTERP_DELAY;
  for (const e of entities.values()) {
    if (!e.samples.length) continue;
    const want = sampleAt(e, renderAt);
    const step = tmp.set(want.x - e.pos.x, 0, want.z - e.pos.z);
    if (step.length() > MAX_SPEED * dt) step.setLength(MAX_SPEED * dt);
    e.pos.add(step);
    e.liftNow += (e.lift - e.liftNow) * (1 - Math.exp(-dt * 1.4));
    const ground = terrainHeight(e.pos.x, e.pos.z);
    e.ground = ground;
    e.pos.y = e.kind === "openclaw" ? AI_ALT : ground + e.liftNow;
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
    e.dim += ((follow && !e.spotlight ? 0.22 : 1) - e.dim) * (1 - Math.exp(-dt * 4));
    for (const mat of e.solids) mat.opacity = mat.userData.baseOpacity * e.dim;
    e.div.style.opacity = String(Math.max(0.3, e.dim));
    e.model.accent.color.copy(e.color).multiplyScalar(flicker * (0.35 + 0.65 * e.dim));
    if (e.model.rotors) {
      for (const r of e.model.rotors) {
        r.blade.rotation.y += dt * (airborne ? 40 : 3);
        r.disc.material.color.copy(e.color);
        r.disc.material.opacity = (airborne ? 0.2 : 0.04) * e.dim;
      }
      e.model.beam.visible = airborne && !BAD.has(e.status);
      e.model.beam.material.opacity = 0.05 * e.dim;
      e.model.beam.material.color.copy(e.color);
    }
    if (e.model.parts) {
      // The pilot breathes, keeps an eye on RAPACE-07, and the antenna tip blinks while it talks.
      const { upper, head, tip } = e.model.parts;
      upper.scale.y = 1 + 0.012 * Math.sin(t * 1.6 + e.phase);
      const watched = spotlightKey && spotlightKey !== e.key ? entities.get(spotlightKey) : null;
      if (watched) {
        const dx = watched.model.group.position.x - g.position.x;
        const dz = watched.model.group.position.z - g.position.z;
        const want = Math.atan2(-dz, dx);
        let d = want - e.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        e.heading += d * Math.min(1, dt * 1.5);
        g.rotation.y = e.heading;
        // Head tilts up towards a drone in the air.
        const rise = watched.model.group.position.y - g.position.y;
        head.rotation.z = THREE.MathUtils.clamp(Math.atan2(rise, Math.hypot(dx, dz)), 0, 0.6) * 0.8;
      }
      tip.scale.setScalar(Math.sin(t * 6 + e.phase) > 0.6 ? 1.6 : 1);
    }
    if (e.model.beacon) e.model.beacon.scale.setScalar(1 + 0.35 * Math.sin(t * 4));
    if (e.model.core) e.model.core.scale.setScalar(1 + 0.12 * Math.sin(t * 3 + e.phase));

    e.marker.visible = e.kind !== "openclaw";
    e.marker.position.set(g.position.x, e.ground + 0.8, g.position.z);
    e.marker.material.color.copy(e.color);
    e.marker.material.opacity = 0.55 * e.dim;
    e.marker.scale.setScalar(e.spotlight ? 1.6 : 1);
    const tp = e.tether.geometry.attributes.position;
    tp.setXYZ(0, g.position.x, e.ground + 0.8, g.position.z);
    tp.setXYZ(1, g.position.x, g.position.y, g.position.z);
    tp.needsUpdate = true;
    e.tether.visible = airborne;
    e.tether.material.color.copy(e.color);
    e.tether.material.opacity = 0.25 * e.dim;
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
    spot.ring.position.set(at.x, sp.ground + 1, at.z);
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
  const riding = ATTACKER.activity === "control" && ATTACKER.target && entities.get(ATTACKER.target);
  hijack.line.visible = Boolean(riding);
  if (riding) {
    anchor(ATTACKER.target, B);
    const attr = hijack.line.geometry.attributes.position;
    for (let k = 0; k < attr.count; k++) {
      curvePoint(attackerTop, B, k / (attr.count - 1), P);
      attr.setXYZ(k, P.x, P.y, P.z);
    }
    attr.needsUpdate = true;
    hijack.line.material.opacity = 0.45 + 0.35 * Math.sin(t * 5);
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
// `/?debug` exposes the scene to the browser console, to frame the camera on a model by hand.
if (new URLSearchParams(location.search).has("debug")) window.__ecw = { THREE, camera, controls, entities };

new ResizeObserver(resize).observe(host);
resize();
requestAnimationFrame(frame);

// ─── Presenter controls ────────────────────────────────────────────────────────

const orbitBtn = document.getElementById("view-orbit");
const followBtn = document.getElementById("view-follow");
const resetBtn = document.getElementById("view-reset");
const focusBtn = document.getElementById("view-focus");
focusBtn.onclick = () => {
  focus = !focus;
  focusBtn.classList.toggle("on", focus);
  // Clear what is already in the air too, or the toggle seems to lag by a packet's flight time.
  if (focus)
    for (let i = packets.length - 1; i >= 0; i--) {
      if (involvesSpotlight(packets[i].link)) continue;
      dispose(packets[i].trail);
      packets.splice(i, 1);
    }
};
/** Auto-rotation. Paused by the button, by the space bar, or by grabbing the camera — a presenter
 *  who has framed something does not want it drifting away — and remembered across reloads. */
function setRotation(on) {
  controls.autoRotate = on;
  orbitBtn.classList.toggle("on", on);
  orbitBtn.textContent = on ? "⏸ Pause rotation" : "▶ Reprendre rotation";
  orbitBtn.title = on ? "Arrêter la rotation automatique (Espace)" : "Relancer la rotation automatique (Espace)";
  try {
    localStorage.setItem("ecw.rotate", on ? "1" : "0");
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}
let savedRotation = null;
try {
  savedRotation = localStorage.getItem("ecw.rotate");
} catch {
  /* storage unavailable */
}
setRotation(savedRotation === null ? !reducedMotion : savedRotation === "1");
orbitBtn.onclick = () => setRotation(!controls.autoRotate);
controls.addEventListener("start", () => {
  if (controls.autoRotate && controls.enabled) setRotation(false);
});
window.addEventListener("keydown", (ev) => {
  if (ev.code !== "Space" || ev.target.closest?.("input, textarea, button, select")) return;
  ev.preventDefault();
  setRotation(!controls.autoRotate);
});
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
