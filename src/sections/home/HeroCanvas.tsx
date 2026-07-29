/**
 * HeroCanvas — fond WebGL du hero (home.md S1).
 * ~1 200 particules iris/cyan en orbite autour d'un orbe lumineux ; toutes
 * les 14 s elles forment une bulle de dialogue (interpolation 2.4 s), puis
 * se dispersent. Parallaxe souris (rotation ±0.04 rad, lerp .05).
 * Fallback : hero-fallback.png + orbe CSS (WebGL absent / reduced-motion).
 * Un seul draw call instancié (<points>), rendu mis en pause hors viewport.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 1200;
const CYCLE = 14; // s
const MORPH = 2.4; // s
const HOLD_END = 7;
const MORPH_OUT_END = 9.4;

/** Points cibles formant une bulle de dialogue (périmètre + queue), plan z≈0 */
function bubbleTargets(): Float32Array {
  const pts: number[] = [];
  const R = 2.3;
  const rx = R * 1.25;
  const ry = R * 0.82;
  const perim = Math.floor(COUNT * 0.86);
  for (let i = 0; i < perim; i++) {
    const a = (i / perim) * Math.PI * 2;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;
    pts.push(Math.cos(a) * rx * jitter, Math.sin(a) * ry * jitter + 0.25, (Math.random() - 0.5) * 0.25);
  }
  // queue de la bulle (triangle bas-gauche)
  const tail = COUNT - perim;
  for (let i = 0; i < tail; i++) {
    const t = i / tail;
    const x = -rx * 0.55 - t * 0.5 + (Math.random() - 0.5) * 0.14;
    const y = 0.25 - ry * 0.72 - t * 0.55 + (Math.random() - 0.5) * 0.14;
    pts.push(x, y, (Math.random() - 0.5) * 0.2);
  }
  return new Float32Array(pts);
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function Particles() {
  const ref = useRef<THREE.Points>(null);
  const targets = useMemo(() => bubbleTargets(), []);
  const { base, colors } = useMemo(() => {
    const base = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const iris = new THREE.Color("#FF5A4E");
    const cyan = new THREE.Color("#FF9F2E");
    const mint = new THREE.Color("#0DBA9B");
    for (let i = 0; i < COUNT; i++) {
      const r = 1.6 + Math.random() * 3.4;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 2.6;
      base[i * 3] = Math.cos(theta) * r;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = Math.sin(theta) * r;
      const c = Math.random() < 0.72 ? iris.clone().lerp(cyan, Math.random()) : mint.clone().lerp(cyan, Math.random() * 0.4);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    return { base, colors };
  }, []);

  const orbit = useMemo(() => {
    // paramètres orbitaux par particule : vitesse angulaire + phase + amplitude respiration
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] = 0.05 + Math.random() * 0.22; // vitesse
      arr[i * 3 + 1] = Math.random() * Math.PI * 2; // phase
      arr[i * 3 + 2] = 0.15 + Math.random() * 0.5; // amplitude
    }
    return arr;
  }, []);

  const positions = useMemo(() => new Float32Array(base), [base]);

  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    const t = clock.getElapsedTime();
    const phase = t % CYCLE;
    let k = 0; // 0 = orbite, 1 = bulle
    if (phase < MORPH) k = easeInOut(phase / MORPH);
    else if (phase < HOLD_END) k = 1;
    else if (phase < MORPH_OUT_END) k = 1 - easeInOut((phase - HOLD_END) / (MORPH_OUT_END - HOLD_END));

    const pos = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const speed = orbit[i3];
      const ph = orbit[i3 + 1];
      const amp = orbit[i3 + 2];
      // position orbitale : rotation lente autour de Y + respiration
      const bx = base[i3];
      const bz = base[i3 + 2];
      const ang = t * speed + ph;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const breathe = 1 + Math.sin(t * 0.6 + ph) * 0.04 * amp;
      const ox = (bx * cos - bz * sin) * breathe;
      const oy = base[i3 + 1] + Math.sin(t * 0.5 + ph * 2) * 0.18 * amp;
      const oz = (bx * sin + bz * cos) * breathe;
      pos[i3] = ox + (targets[i3] - ox) * k;
      pos[i3 + 1] = oy + (targets[i3 + 1] - oy) * k;
      pos[i3 + 2] = oz + (targets[i3 + 2] - oz) * k;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Core() {
  const halo = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,90,78,.85)");
    g.addColorStop(0.35, "rgba(255,159,46,.35)");
    g.addColorStop(1, "rgba(255,159,46,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(({ clock }) => {
    if (halo.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * (Math.PI / 3)) * 0.06; // respire 6s
      halo.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshBasicMaterial color="#FF8A7E" />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[1.05, 32, 32]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.75}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += (target.current.x * 0.14 - g.rotation.y) * 0.05;
    g.rotation.x += (target.current.y * 0.09 - g.rotation.x) * 0.05;
  });
  return <group ref={group}>{children}</group>;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function HeroCanvas() {
  const [ok] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches && hasWebGL(),
  );
  const [visible, setVisible] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  // pause du rendu hors viewport
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!ok) {
    // Fallback statique : poster + orbe CSS
    return (
      <div ref={wrapRef} className="absolute inset-0" aria-hidden>
        <img src="/hero-fallback.png" alt="" className="h-full w-full object-cover opacity-70" />
        <div className="absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-iris/25 blur-[90px]" />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="absolute inset-0" aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 6.2], fov: 46 }}
        dpr={[1, 1.75]}
        frameloop={visible ? "always" : "never"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Rig>
          <Core />
          <Particles />
        </Rig>
      </Canvas>
    </div>
  );
}
