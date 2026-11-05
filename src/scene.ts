/**
 * The look: the solar system, textured with NASA-derived planet maps.
 *
 * A hand drives it the same way it drove the tree:
 *   open palm  → pull back to the whole system (orbits spread, camera retreats)
 *   fist       → pull in tight (orbits close, camera comes forward)
 *   palm x / y → orbit the camera;  hand roll → a slight dutch tilt
 *
 * Textures live in public/textures (Solar System Scope, CC BY 4.0). They are 2k on purpose: an 8k equirect map
 * decodes to ~128 MB of VRAM each, and a planet is only a couple of hundred pixels wide on screen.
 */
import * as THREE from 'three';

const FOV = 45;
const CAM_NEAR = 38;
const CAM_FAR = 62;

const SUN_R = 2.4;

interface RingSpec { inner: number; outer: number }

interface PlanetSpec {
  name: string;
  tex: string;
  radius: number;
  orbit: number;
  /** Radians per second of self-rotation. Negative = retrograde. */
  spin: number;
  /** Radians per second of revolution at rest. */
  period: number;
  /** Axial tilt, radians. */
  tilt: number;
  ring?: RingSpec;
}

/** Sizes and orbits are compressed for the eye, not to scale — real ratios make Mercury invisible. */
const PLANETS: PlanetSpec[] = [
  { name: '水星', tex: '2k_mercury.jpg', radius: 0.5, orbit: 4.2, spin: 0.3, period: 0.62, tilt: 0.001 },
  { name: '金星', tex: '2k_venus_surface.jpg', radius: 0.8, orbit: 6.0, spin: -0.1, period: 0.44, tilt: 3.09 },
  { name: '地球', tex: '2k_earth_daymap.jpg', radius: 0.88, orbit: 7.9, spin: 0.85, period: 0.34, tilt: 0.41 },
  { name: '火星', tex: '2k_mars.jpg', radius: 0.64, orbit: 10.0, spin: 0.8, period: 0.27, tilt: 0.44 },
  { name: '木星', tex: '2k_jupiter.jpg', radius: 1.78, orbit: 13.6, spin: 1.7, period: 0.16, tilt: 0.05 },
  { name: '土星', tex: '2k_saturn.jpg', radius: 1.5, orbit: 17.0, spin: 1.5, period: 0.12, tilt: 0.47, ring: { inner: 1.9, outer: 3.3 } },
  { name: '天王星', tex: '2k_uranus.jpg', radius: 1.02, orbit: 19.8, spin: -0.65, period: 0.085, tilt: 1.71 },
  { name: '海王星', tex: '2k_neptune.jpg', radius: 0.98, orbit: 22.0, spin: 0.7, period: 0.068, tilt: 0.49 },
];

const TEX = (f: string) => `/textures/${f}`;

interface Planet {
  spec: PlanetSpec;
  group: THREE.Group;
  sphere: THREE.Mesh;
  angle: number;
}

export interface HandView {
  /** Palm centre on screen, 0..1. */
  x: number;
  y: number;
  /** Mean finger extension, 0 curled … 1 open. Drives the pull-back. */
  openness: number;
  /** Hand tilt in the image plane, radians. */
  roll: number;
  /** Thumb–index pinch strength, 0..1. */
  pinch: number;
}

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly ready: Promise<void>;
  aspect = 1;

  private planets: Planet[] = [];
  private orbits: THREE.Line[] = [];
  private labels: { el: HTMLDivElement; p: Planet }[] = [];
  private sun!: THREE.Mesh;
  private sunGlow!: THREE.Sprite;
  private stage: HTMLElement;

  /** true: moving the hand right swings the scene right (press X in the app to flip). */
  invertX = true;

  private spread = 0.1;
  private target = 0.1;
  private az = 0.6;
  private targetAz = 0.6;
  private polar = 1.16;
  private targetPolar = 1.16;
  private lastHand = 0;
  private lastDist = CAM_NEAR;
  /** ?still=1 freezes the revolution, so a test can measure what the camera does without planets drifting. */
  private still = new URLSearchParams(location.search).has('still');

  constructor(el: HTMLElement, dprCap = 2) {
    this.stage = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
    this.renderer.setClearColor(0x02030a, 1);
    el.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
    this.camera.position.set(0, 8, CAM_NEAR);
    this.resize();
    this.ready = this.build();
  }

  private async build() {
    const loader = new THREE.TextureLoader();
    const load = (f: string) => new Promise<THREE.Texture>((res, rej) => {
      loader.load(TEX(f), (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        res(t);
      }, undefined, () => rej(new Error('贴图加载失败：' + f)));
    });

    const [sunTex, ...rest] = await Promise.all([
      load('2k_sun.jpg'),
      ...PLANETS.map((p) => load(p.tex)),
      load('2k_saturn_ring_alpha.png'),
      load('2k_stars_milky_way.jpg'),
    ]);
    const planetTex = rest.slice(0, PLANETS.length);
    const ringTex = rest[PLANETS.length] as THREE.Texture;
    const starsTex = rest[PLANETS.length + 1] as THREE.Texture;

    // --- sky
    starsTex.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = starsTex;
    this.scene.backgroundIntensity = 0.5;

    // --- the sun: unlit, plus a painted halo (no bloom pass)
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_R, 64, 48),
      new THREE.MeshBasicMaterial({ map: sunTex }),
    );
    this.scene.add(this.sun);

    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffd79a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sunGlow.scale.setScalar(SUN_R * 5.5);
    this.scene.add(this.sunGlow);

    const sunLight = new THREE.PointLight(0xfff2dc, 3.4, 0, 0);
    this.scene.add(sunLight);
    this.scene.add(new THREE.AmbientLight(0x2a3a55, 0.95));

    // --- planets
    PLANETS.forEach((spec, i) => {
      const group = new THREE.Group();
      group.rotation.z = spec.tilt;

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(spec.radius, 64, 48),
        new THREE.MeshStandardMaterial({
          map: planetTex[i], roughness: 0.92, metalness: 0,
          // a touch of self-illumination so the night side still reads as a planet, not a black disc
          emissive: 0xffffff, emissiveMap: planetTex[i], emissiveIntensity: 0.18,
        }),
      );
      group.add(sphere);

      if (spec.ring) {
        const ring = makeRing(spec.ring, ringTex);
        group.add(ring);
      }

      this.scene.add(group);
      const planet: Planet = { spec, group, sphere, angle: Math.random() * Math.PI * 2 };
      this.planets.push(planet);

      const el = document.createElement('div');
      el.className = 'planet-label';
      el.textContent = spec.name;
      this.stage.appendChild(el);
      this.labels.push({ el, p: planet });

      // orbit guide
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 160; k++) {
        const a = (k / 160) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * spec.orbit, 0, Math.sin(a) * spec.orbit));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x3a6a8c, transparent: true, opacity: 0.15 }),
      );
      this.scene.add(line);
      this.orbits.push(line);
    });
  }

  /** Camera state, for tests and for checking that a gesture moves things the right way. */
  get camState() {
    return {
      az: Number(this.az.toFixed(3)),
      polar: Number(this.polar.toFixed(3)),
      dist: Number(this.lastDist.toFixed(1)),
      spread: Number(this.spread.toFixed(3)),
    };
  }

  /** Screen positions of every planet, for tests and for checking that a gesture moves things the right way. */
  get planetScreen(): { name: string; nx: number; ny: number }[] {
    const v = new THREE.Vector3();
    return this.planets.map((p) => {
      v.copy(p.group.position).project(this.camera);
      return { name: p.spec.name, nx: Number(v.x.toFixed(3)), ny: Number(v.y.toFixed(3)) };
    });
  }

  /** Call on window resize. Ignores a 0×0 window (a hidden tab or pane), which would otherwise produce NaNs. */
  resize() {
    const w = innerWidth, h = innerHeight;
    if (w < 2 || h < 2) return;
    this.aspect = w / h;
    this.renderer.setSize(w, h);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  render(hand: HandView | null, dt: number, t: number) {
    // textures may still be loading: nothing to draw yet
    if (!this.sun) { this.renderer.render(this.scene, this.camera); return; }

    // --- spread: an open palm pulls the camera IN (zoom in), a fist pulls it back (zoom out)
    if (hand) {
      this.target = smoothstep(0.4, 0.86, hand.openness);
      this.lastHand = t;
    } else if (t - this.lastHand > 1.2) {
      this.target += (0.12 - this.target) * Math.min(1, dt * 0.8);
    }
    this.spread += (this.target - this.spread) * Math.min(1, dt * 2.6);

    // --- camera: moving the hand right drags the scene right
    if (hand) {
      this.targetAz = (this.invertX ? -1 : 1) * (hand.x - 0.5) * 2.8;
      this.targetPolar = clamp(1.16 + (hand.y - 0.5) * 0.95, 0.32, 1.55);
    } else {
      this.targetAz += dt * 0.1;
    }
    this.az += (this.targetAz - this.az) * Math.min(1, dt * 3.0);
    this.polar += (this.targetPolar - this.polar) * Math.min(1, dt * 3.0);

    // open palm → near (big), fist → far (small)
    const dist = CAM_FAR - this.spread * (CAM_FAR - CAM_NEAR);
    this.lastDist = dist;
    const sp = Math.sin(this.polar), cp = Math.cos(this.polar);
    this.camera.position.set(
      dist * sp * Math.sin(this.az),
      dist * cp + 1.2,
      dist * sp * Math.cos(this.az),
    );
    const tilt = hand ? clamp(hand.roll * 0.25, -0.14, 0.14) : 0;
    this.camera.up.set(Math.sin(tilt), Math.cos(tilt), 0);
    this.camera.lookAt(0, 0, 0);

    // --- orbits tighten as the camera comes in, so the inner planets stay in frame
    const k = 1.1 - this.spread * 0.2;
    for (const line of this.orbits) line.scale.setScalar(k);

    // --- planets
    const speed = 0.55 + this.spread * 0.9;
    for (const p of this.planets) {
      if (!this.still) p.angle += dt * p.spec.period * speed;
      const r = p.spec.orbit * k;
      p.group.position.set(Math.cos(p.angle) * r, 0, Math.sin(p.angle) * r);
      p.sphere.rotation.y += dt * p.spec.spin;
    }

    // --- the sun turns slowly and breathes
    this.sun.rotation.y += dt * 0.035;
    const pulse = 1 + Math.sin(t * 1.1) * 0.02;
    this.sunGlow.scale.setScalar(SUN_R * 5.5 * pulse);
    (this.sunGlow.material as THREE.SpriteMaterial).opacity = 0.85 + Math.sin(t * 1.1) * 0.06;

    // --- labels, projected from world space, pushed clear of the planet's own radius
    const v = new THREE.Vector3();
    const w = innerWidth, h = innerHeight;
    const tanHalf = Math.tan((FOV / 2) * Math.PI / 180);
    for (const { el, p } of this.labels) {
      v.copy(p.group.position).project(this.camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.35 && Math.abs(v.y) < 1.35;
      el.style.opacity = on ? String(0.5 + (1 - this.spread) * 0.4) : '0';
      if (on) {
        const px = (p.spec.radius / (dist * tanHalf)) * (h / 2);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h + px + 9;
        el.style.transform = `translate(-50%, 0) translate(${x}px, ${y}px)`;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/** A ring with the texture running outward along the radius, which is how ring maps are drawn. */
function makeRing(spec: RingSpec, tex: THREE.Texture): THREE.Mesh {
  const geo = new THREE.RingGeometry(spec.inner, spec.outer, 128, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - spec.inner) / (spec.outer - spec.inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color: 0xd9c9a6, transparent: true, opacity: 0.78,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function glowTexture(): THREE.Texture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (let k = 0; k <= 16; k++) {
    const u = k / 16;
    const a = Math.exp(-u * u * 34) * 0.95 + Math.pow(1 - u, 3.4) * 0.3;
    grd.addColorStop(u, `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function smoothstep(lo: number, hi: number, v: number) {
  const x = clamp((v - lo) / (hi - lo), 0, 1);
  return x * x * (3 - 2 * x);
}
