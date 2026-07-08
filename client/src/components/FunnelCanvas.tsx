import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

interface Stage {
  label: string;
  count: number;
  reach: number;
  color: string;
}

export default function FunnelCanvas({ stages }: { stages: Stage[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || stages.length === 0) return;

    const W = el.clientWidth || 640;
    const H = 520;

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();

    // ── Camera ─────────────────────────────────────────────────────────────
    // FOV 48 + position (5, 3, 15) gives a classic 3/4 elevated side view:
    // all 8 stages visible, top ellipse shows depth, not looking straight down.
    const camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 100);
    camera.position.set(5, 3, 15);
    camera.lookAt(0, 0, 0);

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // ── Lights ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(6, 8, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-5, -4, -4);
    scene.add(fill);

    // ── TrackballControls — full 3D rotation like Blender ─────────────────
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.5;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noPan = true;
    controls.minDistance = 5;
    controls.maxDistance = 22;
    controls.dynamicDampingFactor = 0.18;

    // ── Funnel geometry ────────────────────────────────────────────────────
    const maxCount = stages[0].count || 1;
    const MAX_R = 2.3;
    const MIN_R = 0.38;
    const STAGE_H = 1.5;
    const totalH = stages.length * STAGE_H;
    const getR = (n: number) => Math.max(MIN_R, MAX_R * (n / maxCount));

    const group = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    const mats: THREE.MeshPhongMaterial[] = [];

    stages.forEach((stage, i) => {
      const topR = getR(stage.count);
      const botR = i < stages.length - 1
        ? getR(stages[i + 1].count)
        : Math.max(MIN_R, getR(stage.count) * 0.58);
      const centerY = totalH / 2 - i * STAGE_H - STAGE_H / 2;
      const color = new THREE.Color(stage.color);

      const mat = new THREE.MeshPhongMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.12),
        shininess: 72,
        transparent: true,
        opacity: 0.9,
      });
      mats.push(mat);

      // Body frustum
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(topR, botR, STAGE_H, 72, 1, false),
        mat,
      );
      mesh.position.y = centerY;
      mesh.userData = { index: i, baseColor: color.clone() };
      group.add(mesh);
      meshes.push(mesh);

      // Top cap (stage 0 only) and bottom cap (last stage only)
      if (i === 0) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(topR, 72), mat.clone());
        cap.rotation.x = -Math.PI / 2;
        cap.position.y = centerY + STAGE_H / 2;
        group.add(cap);
      }
      if (i === stages.length - 1) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(botR, 72), mat.clone());
        cap.rotation.x = Math.PI / 2;
        cap.position.y = centerY - STAGE_H / 2;
        group.add(cap);
      }
    });

    scene.add(group);

    // ── Raycaster (hover) ──────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hovIdx: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(meshes);

      if (hovIdx !== null) {
        mats[hovIdx].emissive.copy(
          (meshes[hovIdx].userData.baseColor as THREE.Color).clone().multiplyScalar(0.12),
        );
        mats[hovIdx].opacity = 0.9;
      }

      if (hits.length > 0) {
        hovIdx = (hits[0].object as THREE.Mesh).userData.index as number;
        mats[hovIdx].emissive.copy(
          (meshes[hovIdx].userData.baseColor as THREE.Color).clone().multiplyScalar(0.48),
        );
        mats[hovIdx].opacity = 1.0;
        setHovered(hovIdx);
      } else {
        hovIdx = null;
        setHovered(null);
      }
    };

    renderer.domElement.addEventListener('mousemove', onMouseMove);

    // ── Animation loop ─────────────────────────────────────────────────────
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      // Update HTML label positions imperatively — no React re-render per frame
      meshes.forEach((mesh, i) => {
        const labelEl = labelsRef.current[i];
        if (!labelEl) return;
        const projected = mesh.position.clone().project(camera);
        if (projected.z > 1) {
          labelEl.style.opacity = '0';
          return;
        }
        labelEl.style.opacity = '1';
        labelEl.style.left = `${((projected.x + 1) / 2) * W}px`;
        labelEl.style.top = `${((-projected.y + 1) / 2) * H}px`;
      });
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [stages]);

  const fmtR = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : `${n}`;

  return (
    <div className="relative w-full" style={{ height: 520 }}>
      <div ref={mountRef} className="w-full h-full" />

      {/* HTML label overlay — positioned imperatively by the animation loop */}
      {stages.map((stage, i) => {
        const prevCount = i > 0 ? stages[i - 1].count : stage.count;
        const convPct =
          i > 0 && prevCount > 0
            ? `${((stage.count / prevCount) * 100).toFixed(1)}% conv.`
            : null;
        return (
          <div
            key={i}
            ref={el => { labelsRef.current[i] = el; }}
            className="absolute pointer-events-none text-center select-none transition-opacity duration-100"
            style={{ transform: 'translate(-50%, -50%)' }}
          >
            <div
              className="text-white text-[10px] font-bold uppercase tracking-widest"
              style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}
            >
              {stage.label}
            </div>
            <div
              className="text-white text-lg font-black leading-tight"
              style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}
            >
              {stage.count.toLocaleString()}
            </div>
            <div
              className="text-white text-[10px] opacity-80"
              style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}
            >
              {hovered === i && convPct ? convPct : `${fmtR(stage.reach)} reach`}
            </div>
          </div>
        );
      })}

      <div className="absolute bottom-2 right-3 text-[10px] text-slate-400 pointer-events-none select-none">
        Drag to rotate · scroll to zoom
      </div>
    </div>
  );
}
