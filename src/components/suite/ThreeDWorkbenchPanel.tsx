import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ReviewProject } from '../../types';
import { ChevronDown, ChevronUp, Camera, Layers, Pause, Play } from 'lucide-react';

interface ThreeDWorkbenchPanelProps {
  project: ReviewProject;
}

type CameraPresetId = 'overview' | 'uav' | 'mast' | 'top';

// Pre-allocated math helpers outside render loop (zero GC churn)
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _dummyMatrix = new THREE.Matrix4();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3();
const _dummyPos = new THREE.Vector3();
const _instanceColor = new THREE.Color();

function groundHeightAt(x: number, z: number): number {
  return (
    Math.sin(x * 0.22) * Math.cos(z * 0.22) * 0.85 +
    Math.sin(x * 0.09 + 1.1) * 0.45 +
    Math.cos(z * 0.14) * 0.35
  );
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { label: 'Field Overview', pos: [11, 7.5, 12], target: [0, 2.2, 0] },
  uav: { label: 'UAV Inspection', pos: [3.2, 5.2, 3.8], target: [0, 3.9, 0] },
  mast: { label: 'Sensor Mast', pos: [-2.2, 2.8, 5.2], target: [-4.0, 1.4, -1.5] },
  top: { label: 'Top-Down GIS', pos: [0.01, 17, 0.01], target: [0, 0, 0] },
};

export const ThreeDWorkbenchPanel: React.FC<ThreeDWorkbenchPanelProps> = ({ project }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('overview');
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Mutable refs so React UI changes never re-initialize the WebGL context
  const explodeRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);
  const presetTriggerRef = useRef<{ active: boolean; id: CameraPresetId }>({
    active: false,
    id: 'overview',
  });

  useEffect(() => {
    explodeRef.current = explodeFactor;
  }, [explodeFactor]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const handleSelectPreset = (id: CameraPresetId) => {
    setActivePreset(id);
    presetTriggerRef.current = { active: true, id };
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software-WebGL Detection (never user-agent)
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 460;

    // 2. Renderer Setup (Three.js r160+ PBR standards)
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 3. Scene, Fog & Studio RoomEnvironment IBL
    const scene = new THREE.Scene();
    const horizonColor = new THREE.Color(0x0b1220);
    scene.background = horizonColor;
    scene.fog = new THREE.FogExp2(0x0b1220, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // 4. Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 140);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();

    const onControlStart = () => {
      presetTriggerRef.current.active = false;
    };
    controls.addEventListener('start', onControlStart);

    // 5. Three-Point Studio + Natural Horizon Lighting
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.1);
    keyLight.position.set(10, 16, 8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 45;
      keyLight.shadow.camera.left = -14;
      keyLight.shadow.camera.right = 14;
      keyLight.shadow.camera.top = 14;
      keyLight.shadow.camera.bottom = -14;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-10, 8, -10);
    scene.add(rimLight);

    // Track disposables cleanly
    const disposables: { dispose: () => void }[] = [envTarget];

    // 6. Procedural Topographical Terrain (with vertex color elevation bands)
    const terrainGeo = new THREE.PlaneGeometry(54, 54, 72, 72);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    const colors: number[] = [];
    const lowCol = new THREE.Color(0x0f293a);
    const midCol = new THREE.Color(0x134e4a);
    const highCol = new THREE.Color(0x334155);
    const tmpCol = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = groundHeightAt(vx, vz);
      posAttr.setY(i, vy);
      const norm = THREE.MathUtils.clamp((vy + 1.4) / 2.8, 0, 1);
      tmpCol.copy(lowCol).lerp(midCol, Math.min(1, norm * 1.4)).lerp(highCol, Math.max(0, norm - 0.5));
      colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.06,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = !isSoftwareGl;
    scene.add(terrainMesh);
    disposables.push(terrainGeo, terrainMat);

    // Subtle elevation grid overlay offset above terrain to avoid Z-fighting
    const contourGeo = new THREE.PlaneGeometry(36, 36, 24, 24);
    contourGeo.rotateX(-Math.PI / 2);
    const cAttr = contourGeo.attributes.position;
    for (let i = 0; i < cAttr.count; i++) {
      cAttr.setY(i, groundHeightAt(cAttr.getX(i), cAttr.getZ(i)) + 0.03);
    }
    const contourMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const contourMesh = new THREE.Mesh(contourGeo, contourMat);
    scene.add(contourMesh);
    disposables.push(contourGeo, contourMat);

    // 7. Instanced Survey Markers / Evidence Nodes (> 20 identical props -> InstancedMesh)
    const markerCount = Math.max(24, Math.min(48, (project.articles || []).length + 24));
    const markerGeo = new THREE.CylinderGeometry(0.11, 0.18, 0.55, 8);
    markerGeo.translate(0, 0.275, 0);
    const markerMat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.4,
    });
    const markerInstanced = new THREE.InstancedMesh(markerGeo, markerMat, markerCount);
    markerInstanced.castShadow = !isSoftwareGl;
    for (let i = 0; i < markerCount; i++) {
      const angle = i * 2.39996; // Golden angle scatter
      const radius = 3.0 + Math.sqrt(i) * 1.9;
      const mx = Math.cos(angle) * radius;
      const mz = Math.sin(angle) * radius;
      const my = groundHeightAt(mx, mz);
      const s = 0.85 + ((i % 5) - 2) * 0.06;
      _dummyPos.set(mx, my, mz);
      _dummyScale.set(s, s, s);
      _dummyQuat.identity();
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      markerInstanced.setMatrixAt(i, _dummyMatrix);
      _instanceColor.setHex(i % 3 === 0 ? 0x10b981 : i % 3 === 1 ? 0x38bdf8 : 0xf59e0b);
      markerInstanced.setColorAt(i, _instanceColor);
    }
    markerInstanced.instanceMatrix.needsUpdate = true;
    if (markerInstanced.instanceColor) markerInstanced.instanceColor.needsUpdate = true;
    markerInstanced.computeBoundingSphere();
    scene.add(markerInstanced);
    disposables.push(markerGeo, markerMat);

    // 8. Composite Hero Model 1: Hexacopter Survey UAV (THREE.Group, 12+ parts)
    const uavGroup = new THREE.Group();
    const uavBaseY = 4.0;
    uavGroup.position.set(0, uavBaseY, 0);

    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.52,
      metalness: 0.25,
    });
    const alloyMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.22,
      metalness: 0.88,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.35,
      metalness: 0.4,
    });
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.42,
      metalness: 0.3,
    });
    const lensGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.08,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.9,
      transparent: true,
      opacity: isSoftwareGl ? 0.5 : 1,
      ior: 1.55,
      clearcoat: 1.0,
    });
    disposables.push(carbonMat, alloyMat, accentMat, rotorMat, lensGlassMat);

    // Extruded beveled fuselage hull (Primary Silhouette)
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-0.55, -0.45);
    hullShape.lineTo(0.55, -0.45);
    hullShape.lineTo(0.75, 0);
    hullShape.lineTo(0.55, 0.45);
    hullShape.lineTo(-0.55, 0.45);
    hullShape.lineTo(-0.75, 0);
    hullShape.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 2,
    });
    hullGeo.center();
    hullGeo.rotateX(Math.PI / 2);
    const hullMesh = new THREE.Mesh(hullGeo, carbonMat);
    hullMesh.castShadow = !isSoftwareGl;
    uavGroup.add(hullMesh);
    disposables.push(hullGeo);

    // Top Canopy Shell (Explodable Layer)
    const canopyGeo = new THREE.SphereGeometry(0.46, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
    canopyGeo.scale(1.15, 0.55, 0.9);
    const canopyMesh = new THREE.Mesh(canopyGeo, alloyMat);
    canopyMesh.position.set(0, 0.14, 0);
    canopyMesh.castShadow = !isSoftwareGl;
    uavGroup.add(canopyMesh);
    disposables.push(canopyGeo);

    // Underside Gimbal Sensor Pod + Optical Lens (Explodable Layer)
    const gimbalGroup = new THREE.Group();
    gimbalGroup.position.set(0, -0.34, 0.15);
    const gimbalHousingGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.24, 16);
    const gimbalHousing = new THREE.Mesh(gimbalHousingGeo, alloyMat);
    gimbalGroup.add(gimbalHousing);

    const lensGeo = new THREE.SphereGeometry(0.14, 16, 12);
    const lensMesh = new THREE.Mesh(lensGeo, lensGlassMat);
    lensMesh.position.set(0, -0.04, 0.18);
    gimbalGroup.add(lensMesh);
    uavGroup.add(gimbalGroup);
    disposables.push(gimbalHousingGeo, lensGeo);

    // Dual Landing Skids
    const skidsGroup = new THREE.Group();
    const skidGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8);
    skidGeo.rotateZ(Math.PI / 2);
    const strutGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8);
    [-0.45, 0.45].forEach((sz) => {
      const bar = new THREE.Mesh(skidGeo, alloyMat);
      bar.position.set(0, -0.62, sz);
      skidsGroup.add(bar);
      [-0.35, 0.35].forEach((sx) => {
        const strut = new THREE.Mesh(strutGeo, carbonMat);
        strut.position.set(sx, -0.36, sz * 0.85);
        strut.rotation.x = sz > 0 ? -0.25 : 0.25;
        skidsGroup.add(strut);
      });
    });
    uavGroup.add(skidsGroup);
    disposables.push(skidGeo, strutGeo);

    // 6 Radial Rotor Arms + Motors + Blades
    const armGeo = new THREE.CylinderGeometry(0.042, 0.05, 1.35, 10);
    armGeo.rotateZ(Math.PI / 2);
    const motorGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.18, 14);
    const bladeGeo = new THREE.BoxGeometry(0.95, 0.014, 0.08);
    const rotors: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const armPivot = new THREE.Group();
      armPivot.rotation.y = ang;

      const armMesh = new THREE.Mesh(armGeo, i < 2 ? accentMat : carbonMat);
      armMesh.position.set(0.95, 0.04, 0);
      armMesh.castShadow = !isSoftwareGl;
      armPivot.add(armMesh);

      const motor = new THREE.Mesh(motorGeo, alloyMat);
      motor.position.set(1.58, 0.12, 0);
      armPivot.add(motor);

      const blade = new THREE.Mesh(bladeGeo, rotorMat);
      blade.position.set(1.58, 0.23, 0);
      armPivot.add(blade);
      rotors.push(blade);

      uavGroup.add(armPivot);
    }
    disposables.push(armGeo, motorGeo, bladeGeo);
    scene.add(uavGroup);

    // 9. Composite Hero Model 2: Field Ground Station Mast (bottom-center grounded on terrain)
    const mastX = -4.0;
    const mastZ = -1.5;
    const mastGroundY = groundHeightAt(mastX, mastZ);
    const mastGroup = new THREE.Group();
    mastGroup.position.set(mastX, mastGroundY, mastZ);

    const padGeo = new THREE.CylinderGeometry(0.9, 1.05, 0.14, 16);
    padGeo.translate(0, 0.07, 0);
    const padMesh = new THREE.Mesh(padGeo, carbonMat);
    padMesh.receiveShadow = !isSoftwareGl;
    mastGroup.add(padMesh);

    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 2.7, 12);
    poleGeo.translate(0, 1.42, 0);
    const poleMesh = new THREE.Mesh(poleGeo, alloyMat);
    poleMesh.castShadow = !isSoftwareGl;
    mastGroup.add(poleMesh);

    const solarPanelGeo = new THREE.BoxGeometry(0.85, 0.04, 0.62);
    const solarPanel = new THREE.Mesh(solarPanelGeo, accentMat);
    solarPanel.position.set(0.28, 2.05, 0);
    solarPanel.rotation.z = -0.42;
    mastGroup.add(solarPanel);

    const antennaGeo = new THREE.SphereGeometry(0.2, 14, 10);
    const antennaMesh = new THREE.Mesh(antennaGeo, alloyMat);
    antennaMesh.position.set(0, 2.86, 0);
    mastGroup.add(antennaMesh);
    disposables.push(padGeo, poleGeo, solarPanelGeo, antennaGeo);
    scene.add(mastGroup);

    // Soft radial contact shadow under ground station mast
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      const rg = sctx.createRadialGradient(64, 64, 8, 64, 64, 60);
      rg.addColorStop(0, 'rgba(0,0,0,0.65)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = rg;
      sctx.fillRect(0, 0, 128, 128);
    }
    const contactTex = new THREE.CanvasTexture(shadowCanvas);
    contactTex.colorSpace = THREE.SRGBColorSpace;
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const contactGeo = new THREE.PlaneGeometry(3.2, 3.2);
    contactGeo.rotateX(-Math.PI / 2);
    const contactMesh = new THREE.Mesh(contactGeo, contactMat);
    contactMesh.position.set(mastX, mastGroundY + 0.025, mastZ);
    scene.add(contactMesh);
    disposables.push(contactTex, contactMat, contactGeo);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 10. Context Loss Safety
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // 11. Resize Observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 12. Software-WebGL Paced Animation Loop
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.elapsedTime;

      if (!isPausedRef.current) {
        uavGroup.position.y = uavBaseY + Math.sin(elapsed * 1.6) * 0.18;
        uavGroup.rotation.y = Math.sin(elapsed * 0.35) * 0.25;
        for (let i = 0; i < rotors.length; i++) {
          rotors[i].rotation.y += (i % 2 === 0 ? 1 : -1) * dt * 28;
        }
      }

      // Smooth exponential damping on Exploded View layers
      const exp = explodeRef.current;
      const alpha = 1 - Math.exp(-8 * dt);
      canopyMesh.position.y = THREE.MathUtils.lerp(canopyMesh.position.y, 0.14 + exp * 0.85, alpha);
      gimbalGroup.position.y = THREE.MathUtils.lerp(gimbalGroup.position.y, -0.34 - exp * 0.7, alpha);
      skidsGroup.position.y = THREE.MathUtils.lerp(skidsGroup.position.y, -exp * 0.45, alpha);

      // Smooth damped camera preset transitions
      if (presetTriggerRef.current.active) {
        const preset = CAMERA_PRESETS[presetTriggerRef.current.id];
        _camGoalPos.set(...preset.pos);
        _camGoalTarget.set(...preset.target);
        const camAlpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(_camGoalPos, camAlpha);
        controls.target.lerp(_camGoalTarget, camAlpha);
        if (camera.position.distanceTo(_camGoalPos) < 0.06) {
          presetTriggerRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [project.id]);

  return (
    <div className="relative w-full h-[480px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 select-none">
      {/* Unobstructed 3D Viewport */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Minimal Top-Left Spec Badge (No backdrop-blur, static text only) */}
      <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-[11px] text-slate-200 pointer-events-none">
        <span className="font-bold text-sky-400">3D Field Survey Scene</span>
        <span className="text-slate-400"> • Hexacopter UAV + {Math.max(24, (project.articles || []).length)} Site Nodes</span>
      </div>

      {contextLost && (
        <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center text-xs text-amber-300 font-semibold">
          WebGL context lost. Waiting for GPU recovery...
        </div>
      )}

      {/* Collapsible Bottom Dock (solid/rgba only, no backdrop-filter) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-3xl flex flex-col items-center">
        <button
          type="button"
          onClick={() => setIsDockCollapsed((c) => !c)}
          className="px-3 py-1 rounded-t-xl bg-slate-900/95 border border-b-0 border-slate-700 text-[11px] font-semibold text-slate-300 hover:text-white inline-flex items-center gap-1 cursor-pointer"
        >
          {isDockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {isDockCollapsed ? 'Show Controls' : 'Hide Controls'}
        </button>

        {!isDockCollapsed && (
          <div className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-xl flex flex-wrap items-center justify-between gap-3">
            {/* Camera Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-sky-400 mr-1" />
              {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => handleSelectPreset(pid)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    activePreset === pid
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {CAMERA_PRESETS[pid].label}
                </button>
              ))}
            </div>

            {/* Exploded View & Pause */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Explode</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={explodeFactor}
                  onChange={(e) => setExplodeFactor(Number(e.target.value))}
                  className="w-24 accent-sky-500"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
