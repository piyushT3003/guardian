// 3D globe view for Geospatial Intelligence: stored transaction coordinates on a sphere,
// familiar places, the focus transaction's beam and an animated arc from the nearest familiar place.
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import region from '../lib/region.json';
import { useReducedMotion } from '../lib/hooks.js';
import { km } from '../lib/format.js';

const R = 2;
const RISK = { high: '#f04438', medium: '#f79009', low: '#12b76a' };
export function toVec(lat, lng, r = R) {
  const phi = ((90 - lat) * Math.PI) / 180, th = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
const hav = (a, b) => { const r = (d) => (d * Math.PI) / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

function Outlines() {
  const [other, india] = useMemo(() => {
    const segs = { o: [], i: [] };
    for (const f of region.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const bucket = f.properties.name === 'India' ? segs.i : segs.o;
      for (const poly of polys) for (const ring of poly) for (let k = 0; k < ring.length - 1; k++) {
        const a = toVec(ring[k][1], ring[k][0], R * 1.002), b = toVec(ring[k + 1][1], ring[k + 1][0], R * 1.002);
        bucket.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const mk = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
    return [mk(segs.o), mk(segs.i)];
  }, []);
  const grat = useMemo(() => {
    const arr = [];
    for (let lat = -80; lat <= 80; lat += 10) for (let lng = -180; lng < 180; lng += 4) { const a = toVec(lat, lng, R * 1.001), b = toVec(lat, lng + 4, R * 1.001); arr.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    for (let lng = -180; lng < 180; lng += 10) for (let lat = -88; lat < 88; lat += 4) { const a = toVec(lat, lng, R * 1.001), b = toVec(lat + 4, lng, R * 1.001); arr.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g;
  }, []);
  return (
    <group>
      <lineSegments geometry={grat}><lineBasicMaterial color="#c9bdfb" transparent opacity={0.28} /></lineSegments>
      <lineSegments geometry={other}><lineBasicMaterial color="#9d8cf0" transparent opacity={0.65} /></lineSegments>
      <lineSegments geometry={india}><lineBasicMaterial color="#5b3fe0" /></lineSegments>
    </group>
  );
}

function Atmosphere() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false,
    uniforms: { c: { value: new THREE.Color('#8b6cff') } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(c, clamp(i,0.0,1.0)*0.9); }',
  }), []);
  return <mesh material={mat} scale={1.16}><sphereGeometry args={[R, 64, 64]} /></mesh>;
}

function Points({ points, focusId, onSelect }) {
  const ref = useRef();
  const list = useMemo(() => points.filter((p) => p.id !== focusId), [points, focusId]);
  useEffect(() => {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((p, i) => {
      const v = toVec(p.lat, p.lng, R * 1.012);
      const s = p.risk_level === 'high' ? 1.5 : p.risk_level === 'medium' ? 1.2 : 0.85;
      m.compose(v, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, c.set(p.location_source === 'demo' ? '#dc6803' : p.location_source === 'live_gps' ? '#2e7cf6' : RISK[p.risk_level]));
    });
    ref.current.count = list.length;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [list]);
  return (
    <instancedMesh ref={ref} args={[null, null, Math.max(1, list.length)]} onClick={(e) => { e.stopPropagation(); const p = list[e.instanceId]; if (p) onSelect?.(p); }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      <sphereGeometry args={[0.018, 12, 12]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Beam({ at, color, height = 0.55, label }) {
  const ref = useRef();
  const v = toVec(at.lat, at.lng, R);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()), [at.lat, at.lng]); // eslint-disable-line
  useFrame((st) => { if (ref.current) ref.current.scale.y = 0.85 + 0.15 * Math.sin(st.clock.elapsedTime * 3); });
  const tip = v.clone().normalize().multiplyScalar(R + height);
  return (
    <group>
      <group position={v} quaternion={q}>
        <mesh ref={ref} position={[0, height / 2, 0]}><cylinderGeometry args={[0.008, 0.02, height, 12]} /><meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0.04, 0.07, 32]} /><meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} /></mesh>
      </group>
      <mesh position={tip}><sphereGeometry args={[0.035, 16, 16]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
      {label && <Html position={tip} center distanceFactor={2.6} style={{ pointerEvents: 'none' }}><div className="g-label" style={{ transform: 'translateY(-30px)' }}>{label}</div></Html>}
    </group>
  );
}

function Arc({ from, to, color = '#f04438', label }) {
  const ref = useRef();
  const pts = useMemo(() => {
    const a = toVec(from.lat, from.lng), b = toVec(to.lat, to.lng);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const lift = R + 0.25 + a.distanceTo(b) * 0.45;
    return new THREE.QuadraticBezierCurve3(a, mid.normalize().multiplyScalar(lift), b).getPoints(64);
  }, [from.lat, from.lng, to.lat, to.lng]);
  useFrame((_, d) => { if (ref.current?.material) ref.current.material.dashOffset -= d * 0.6; });
  return (
    <group>
      <Line ref={ref} points={pts} color={color} lineWidth={2.5} dashed dashSize={0.08} gapSize={0.05} transparent opacity={0.95} />
      {label && <Html position={pts[32]} center distanceFactor={2.6} style={{ pointerEvents: 'none' }}><div style={{ background: '#17132e', color: '#fff', borderRadius: 9, padding: '4px 10px', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{label}</div></Html>}
    </group>
  );
}

/** Glides the camera to face a location, then hands control back to the orbit controls. */
function CameraTo({ target, controls }) {
  const { camera } = useThree();
  const anim = useRef(null);
  useEffect(() => {
    const goal = toVec(target.lat, target.lng, 1).normalize();
    anim.current = { from: camera.position.clone().normalize(), to: goal, dist: 5.4, t: 0 };
  }, [target.lat, target.lng]); // eslint-disable-line
  useFrame((_, d) => {
    const a = anim.current; if (!a) return;
    a.t = Math.min(1, a.t + d / 1.4);
    const e = 1 - Math.pow(1 - a.t, 3);
    const dir = a.from.clone().lerp(a.to, e).normalize();
    camera.position.copy(dir.multiplyScalar(a.dist));
    camera.lookAt(0, 0, 0);
    controls.current?.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

export default function Globe3D({ points = [], familiar = [], focus = null, previous = null, live = null, moves = [], onSelect, height = 600 }) {
  const reduced = useReducedMotion();
  const controls = useRef();
  const target = focus || live || familiar[0] || { lat: 22.5, lng: 79 };
  const nearest = focus && familiar.length ? familiar.reduce((m, f) => (hav(f, focus) < hav(m, focus) ? f : m), familiar[0]) : null;
  return (
    <div className="globe-wrap" style={{ height }}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 1, 6], fov: 40 }} gl={{ antialias: true, alpha: true }} frameloop={reduced ? 'demand' : 'always'}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 3, 5]} intensity={0.55} />
        <mesh><sphereGeometry args={[R, 96, 96]} /><meshPhongMaterial color="#ffffff" emissive="#efe9ff" emissiveIntensity={0.8} shininess={24} specular="#d9ccff" /></mesh>
        <Atmosphere />
        <Outlines />
        <Points points={points} focusId={focus?.id} onSelect={onSelect} />
        {familiar.map((f, i) => <Beam key={`f${i}`} at={f} color="#12b76a" height={0.22} label={!focus && i === 0 ? `${f.kind === "home" ? "Home" : "Familiar"} · ${f.city}` : null} />)}
        {previous && <Beam at={previous} color="#7a5af8" height={0.3} />}
        {focus && <Beam at={focus} color={RISK[focus.risk_level] || '#f04438'} height={0.6} label={`${focus.id} · ${focus.city}`} />}
        {live && <Beam at={live} color="#2e7cf6" height={0.45} label="Live GPS · this device" />}
        {focus && nearest && hav(nearest, focus) > 30 && <Arc from={nearest} to={focus} label={km(hav(nearest, focus))} />}
        {!focus && moves.slice(0, 8).map((m, i) => <Arc key={i} from={m.from} to={m.to} color="#f79009" />)}
        <CameraTo target={target} controls={controls} />
        <OrbitControls ref={controls} enablePan={false} minDistance={2.8} maxDistance={9} autoRotate={!reduced && !focus} autoRotateSpeed={0.35} enableDamping dampingFactor={0.08} rotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}
