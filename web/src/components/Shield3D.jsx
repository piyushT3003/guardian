// Guardian signature 3D shield — layered translucent geometry, protective rings, orbiting
// transaction nodes with animated links, particles, and pointer-driven camera drift.
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Float, Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion } from '../lib/hooks.js';

function shieldShape(s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 1.25 * s);
  sh.bezierCurveTo(0.35 * s, 1.05 * s, 0.75 * s, 1.0 * s, 1.0 * s, 1.02 * s);
  sh.bezierCurveTo(1.02 * s, 0.4 * s, 0.98 * s, -0.25 * s, 0.62 * s, -0.75 * s);
  sh.bezierCurveTo(0.42 * s, -1.02 * s, 0.18 * s, -1.18 * s, 0, -1.3 * s);
  sh.bezierCurveTo(-0.18 * s, -1.18 * s, -0.42 * s, -1.02 * s, -0.62 * s, -0.75 * s);
  sh.bezierCurveTo(-0.98 * s, -0.25 * s, -1.02 * s, 0.4 * s, -1.0 * s, 1.02 * s);
  sh.bezierCurveTo(-0.75 * s, 1.0 * s, -0.35 * s, 1.05 * s, 0, 1.25 * s);
  return sh;
}

function Shield({ reduced }) {
  const g = useRef();
  const outer = useMemo(() => new THREE.ExtrudeGeometry(shieldShape(1), { depth: 0.28, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 10, curveSegments: 48 }).center(), []);
  const inner = useMemo(() => new THREE.ExtrudeGeometry(shieldShape(0.74), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.05, bevelSegments: 8, curveSegments: 48 }).center(), []);
  useFrame((st) => { if (!reduced && g.current) g.current.rotation.y = Math.sin(st.clock.elapsedTime * 0.45) * 0.32; });
  return (
    <group ref={g}>
      <mesh geometry={outer}>
        <meshPhysicalMaterial color="#8f74ff" transmission={0.55} thickness={1.2} roughness={0.12} metalness={0.05} clearcoat={1} clearcoatRoughness={0.1}
          iridescence={0.6} iridescenceIOR={1.3} ior={1.45} attenuationColor="#6d4cf6" attenuationDistance={1.6} />
      </mesh>
      <mesh geometry={inner} position={[0, 0.02, 0.22]}>
        <meshPhysicalMaterial color="#6d4cf6" roughness={0.18} metalness={0.25} clearcoat={1} emissive="#4b2fd8" emissiveIntensity={0.35} />
      </mesh>
      {/* lock */}
      <group position={[0, -0.08, 0.42]} scale={0.95}>
        <RoundedBox args={[0.62, 0.5, 0.18]} radius={0.08} smoothness={6} position={[0, -0.12, 0]}>
          <meshPhysicalMaterial color="#ffffff" roughness={0.12} clearcoat={1} metalness={0.1} />
        </RoundedBox>
        <mesh position={[0, 0.16, 0]}>
          <torusGeometry args={[0.2, 0.055, 24, 48, Math.PI]} />
          <meshPhysicalMaterial color="#f4f1ff" roughness={0.1} metalness={0.4} clearcoat={1} />
        </mesh>
        {[-0.2, 0.2].map((x) => <mesh key={x} position={[x, 0.11, 0]}><cylinderGeometry args={[0.055, 0.055, 0.1, 20]} /><meshPhysicalMaterial color="#f4f1ff" roughness={0.1} metalness={0.4} /></mesh>)}
        <mesh position={[0, -0.1, 0.095]}><cylinderGeometry args={[0.055, 0.055, 0.02, 24]} /><meshStandardMaterial color="#6d4cf6" /></mesh>
        <mesh position={[0, -0.2, 0.095]}><boxGeometry args={[0.04, 0.12, 0.02]} /><meshStandardMaterial color="#6d4cf6" /></mesh>
      </group>
    </group>
  );
}

function Rings({ reduced }) {
  const refs = [useRef(), useRef(), useRef()];
  useFrame((_, d) => { if (reduced) return; refs[0].current.rotation.z += d * 0.25; refs[1].current.rotation.z -= d * 0.18; refs[2].current.rotation.z += d * 0.12; });
  const ring = (r, t, color, op) => (<><torusGeometry args={[r, t, 16, 160]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} transparent opacity={op} /></>);
  return (
    <group>
      <mesh ref={refs[0]} rotation={[Math.PI / 2.25, 0, 0]}>{ring(1.95, 0.012, '#9d84ff', 0.85)}</mesh>
      <mesh ref={refs[1]} rotation={[Math.PI / 2.6, 0.35, 0]}>{ring(2.25, 0.008, '#5b8cff', 0.6)}</mesh>
      <mesh ref={refs[2]} rotation={[Math.PI / 2.05, -0.3, 0]}>{ring(2.55, 0.006, '#b9a7ff', 0.45)}</mesh>
      {/* platform glow */}
      <mesh position={[0, -1.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.7, 96]} />
        <meshBasicMaterial color="#8b6cff" transparent opacity={0.16} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -1.76, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 64]} />
        <meshBasicMaterial color="#b9a7ff" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function Nodes({ reduced }) {
  const g = useRef();
  const nodes = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2, r = 2.0 + (i % 3) * 0.32;
    return { p: new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2) * 0.55 + (i % 2 ? 0.4 : -0.3), Math.sin(a) * r * 0.55), risk: i === 2 || i === 6 };
  }), []);
  const lines = useRef([]);
  useFrame((st) => {
    if (reduced) return;
    g.current.rotation.y = st.clock.elapsedTime * 0.12;
    lines.current.forEach((l, i) => { if (l?.material) l.material.opacity = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(st.clock.elapsedTime * 2 + i)); });
  });
  return (
    <group ref={g}>
      {nodes.map((n, i) => (
        <group key={i}>
          <mesh position={n.p}><sphereGeometry args={[n.risk ? 0.075 : 0.055, 24, 24]} />
            <meshStandardMaterial color={n.risk ? '#ff7a6b' : '#7f9cff'} emissive={n.risk ? '#ff5a4a' : '#6d8cff'} emissiveIntensity={1.4} /></mesh>
          <Line ref={(el) => (lines.current[i] = el)} points={[n.p, new THREE.Vector3(0, 0, 0)]} color={n.risk ? '#ff8a7a' : '#a796ff'} lineWidth={1} transparent opacity={0.35} dashed={n.risk} dashSize={0.08} gapSize={0.06} />
        </group>
      ))}
    </group>
  );
}

function Particles({ reduced }) {
  const ref = useRef();
  const geo = useMemo(() => {
    const n = 320, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = 2.2 + Math.random() * 2.4, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); pos.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * 0.7, r * Math.sin(p) * Math.sin(t)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g;
  }, []);
  useFrame((_, d) => { if (!reduced) ref.current.rotation.y -= d * 0.03; });
  return <points ref={ref} geometry={geo}><pointsMaterial size={0.028} color="#9f8cff" transparent opacity={0.7} sizeAttenuation depthWrite={false} /></points>;
}


function glowTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, color); r.addColorStop(0.35, color.replace('1)', '0.35)')); r.addColorStop(1, color.replace('1)', '0)'));
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Soft halo behind the shield and a scanning beam that sweeps across it. */
function Halo({ reduced }) {
  const tex = useMemo(() => glowTexture('rgba(139,108,255,1)'), []);
  const scan = useRef();
  const halo = useRef();
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (!reduced && scan.current) { scan.current.position.y = Math.sin(t * 0.9) * 1.15; scan.current.material.opacity = 0.35 + 0.25 * Math.cos(t * 0.9) ** 2; }
    if (!reduced && halo.current) halo.current.material.opacity = 0.55 + 0.15 * Math.sin(t * 1.4);
  });
  return (
    <group>
      <sprite ref={halo} position={[0, 0, -0.6]} scale={[5.2, 5.2, 1]}><spriteMaterial map={tex} transparent opacity={0.6} depthWrite={false} /></sprite>
      <mesh ref={scan} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.1]}>
        <torusGeometry args={[1.08, 0.008, 8, 120]} />
        <meshBasicMaterial color="#7cc4ff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/** Data packets travelling from transaction nodes into the shield. */
function Packets({ reduced }) {
  const group = useRef();
  const tex = useMemo(() => glowTexture('rgba(120,150,255,1)'), []);
  const lanes = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2, r = 2.0 + (i % 3) * 0.32;
    return { from: new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2) * 0.55 + (i % 2 ? 0.4 : -0.3), Math.sin(a) * r * 0.55), speed: 0.35 + (i % 4) * 0.08, offset: i / 9, risk: i === 2 || i === 6 };
  }), []);
  const refs = useRef([]);
  useFrame((st) => {
    if (reduced) return;
    group.current.rotation.y = st.clock.elapsedTime * 0.12;
    lanes.forEach((l, i) => {
      const k = (st.clock.elapsedTime * l.speed + l.offset) % 1;
      const m = refs.current[i]; if (!m) return;
      m.position.copy(l.from).multiplyScalar(1 - k);
      const s = 0.16 + 0.12 * Math.sin(k * Math.PI);
      m.scale.set(s, s, 1);
      m.material.opacity = Math.sin(k * Math.PI);
    });
  });
  return (
    <group ref={group}>
      {lanes.map((l, i) => (
        <sprite key={i} ref={(el) => (refs.current[i] = el)}>
          <spriteMaterial map={tex} color={l.risk ? '#ff6b5e' : '#ffffff'} transparent depthWrite={false} />
        </sprite>))}
    </group>
  );
}

/** Hexagonal platform tiles that pulse outward like a radar wave. */
function HexPlatform({ reduced }) {
  const tiles = useMemo(() => {
    const out = [];
    for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
      const x = 0.34 * (q + r / 2), z = 0.34 * (r * 0.866);
      const d = Math.hypot(x, z);
      if (d < 1.55 && d > 0.2) out.push({ x, z, d });
    }
    return out;
  }, []);
  const refs = useRef([]);
  useFrame((st) => {
    if (reduced) return;
    const t = st.clock.elapsedTime;
    tiles.forEach((tile, i) => { const m = refs.current[i]; if (!m) return; const w = Math.max(0, Math.sin(t * 1.6 - tile.d * 4)); m.material.opacity = 0.08 + w * 0.32; m.position.y = -1.74 + w * 0.05; });
  });
  return (
    <group>
      {tiles.map((t, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)} position={[t.x, -1.74, t.z]}>
          <cylinderGeometry args={[0.15, 0.15, 0.02, 6]} />
          <meshBasicMaterial color="#8b6cff" transparent opacity={0.15} depthWrite={false} />
        </mesh>))}
    </group>
  );
}

function CameraRig({ reduced }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    if (reduced) return;
    camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.04;
    camera.position.y += (0.2 + pointer.y * 0.5 - camera.position.y) * 0.04;
    camera.lookAt(0, -0.35, 0);
  });
  return null;
}

export default function Shield3D({ height = 300 }) {
  const reduced = useReducedMotion();
  return (
    <div style={{ height, width: '100%' }} aria-label="Guardian real-time payment protection shield" role="img">
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.2, 6.9], fov: 40 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} frameloop={reduced ? 'demand' : 'always'}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} color="#ffffff" />
        <pointLight position={[-3, 1, 2]} intensity={18} color="#7c5cff" />
        <pointLight position={[3, -1, 2]} intensity={14} color="#3b82f6" />
        <Environment resolution={128}>
          <Lightformer intensity={2.2} position={[0, 4, 3]} scale={[8, 2, 1]} color="#ffffff" />
          <Lightformer intensity={1.6} position={[-4, 0, 2]} scale={[2, 6, 1]} color="#c4b5fd" />
          <Lightformer intensity={1.2} position={[4, -1, 2]} scale={[2, 6, 1]} color="#93c5fd" />
        </Environment>
        <Float speed={reduced ? 0 : 1.6} rotationIntensity={reduced ? 0 : 0.15} floatIntensity={reduced ? 0 : 0.6}>
          <Shield reduced={reduced} />
        </Float>
        <Halo reduced={reduced} />
        <Rings reduced={reduced} />
        <HexPlatform reduced={reduced} />
        <Packets reduced={reduced} />
        <Nodes reduced={reduced} />
        <Particles reduced={reduced} />
        <CameraRig reduced={reduced} />
      </Canvas>
    </div>
  );
}
