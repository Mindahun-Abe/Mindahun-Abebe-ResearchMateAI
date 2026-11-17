import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Award } from 'lucide-react';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

interface Entity {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'paper' | 'gold' | 'duplicate';
  radius: number;
  label: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export const ResearchGamePanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [score, setScore] = useState<number>(0);
  const [bestScore, setBestScore] = useState<number>(0);
  const [integrity, setIntegrity] = useState<number>(100);
  const [wave, setWave] = useState<number>(1);
  const [collectedCount, setCollectedCount] = useState<number>(0);
  const [muted, setMuted] = useState<boolean>(false);

  const stateRef = useRef<GameState>('TITLE_MENU');
  const mutedRef = useRef<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playerRef = useRef({ x: 140, y: 210, targetY: 210, pulseCooldown: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const popupsRef = useRef<FloatingPopup[]>([]);
  const metricsRef = useRef({ score: 0, integrity: 100, wave: 1, collected: 0, spawnTimer: 0, nextId: 1 });

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const playTone = (freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.08) => {
    if (mutedRef.current) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Ignore audio errors if blocked by browser autoplay policy
    }
  };

  const resetAndStart = () => {
    playerRef.current = { x: 120, y: 210, targetY: 210, pulseCooldown: 0 };
    entitiesRef.current = [];
    particlesRef.current = [];
    popupsRef.current = [];
    metricsRef.current = { score: 0, integrity: 100, wave: 1, collected: 0, spawnTimer: 0.4, nextId: 1 };
    setScore(0);
    setIntegrity(100);
    setWave(1);
    setCollectedCount(0);
    setGameState('PLAYING');
    playTone(523.25, 0.14, 'triangle');
  };

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'Space' && stateRef.current === 'PLAYING') {
        e.preventDefault();
        if (playerRef.current.pulseCooldown <= 0) {
          playerRef.current.pulseCooldown = 2.8;
          // Clear duplicates ahead with Spectral Scan Pulse
          let cleared = 0;
          entitiesRef.current = entitiesRef.current.filter((ent) => {
            if (ent.kind === 'duplicate' && Math.hypot(ent.x - playerRef.current.x, ent.y - playerRef.current.y) < 260) {
              cleared += 1;
              particlesRef.current.push(
                ...Array.from({ length: 8 }, (_, idx) => {
                  const ang = (idx / 8) * Math.PI * 2;
                  return {
                    x: ent.x,
                    y: ent.y,
                    vx: Math.cos(ang) * 90,
                    vy: Math.sin(ang) * 90,
                    life: 0.45,
                    color: '#38bdf8',
                  };
                })
              );
              return false;
            }
            return true;
          });
          if (cleared > 0) {
            metricsRef.current.score += cleared * 50;
            setScore(metricsRef.current.score);
            popupsRef.current.push({
              x: playerRef.current.x + 30,
              y: playerRef.current.y - 24,
              text: `DEDUP +${cleared * 50}`,
              life: 0.9,
              color: '#38bdf8',
            });
          }
          playTone(660, 0.16, 'sine');
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Main 2D Canvas Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const w = canvas.width;
      const h = canvas.height;

      // 60% dominant deep navy-slate arena surface (#0A192F)
      ctx.fillStyle = '#0A192F';
      ctx.fillRect(0, 0, w, h);

      // Subtle parallax contour grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      const scrollOffset = ((now * 0.06) % 48);
      for (let gx = -scrollOffset; gx <= w; gx += 48) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy <= h; gy += 48) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      if (stateRef.current === 'PLAYING') {
        const m = metricsRef.current;
        const p = playerRef.current;

        // Player motion (keyboard + pointer smooth follow)
        const speed = 280;
        if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) {
          p.y -= speed * dt;
          p.targetY = p.y;
        } else if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) {
          p.y += speed * dt;
          p.targetY = p.y;
        } else {
          p.y += (p.targetY - p.y) * Math.min(1, dt * 10);
        }
        if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) p.x -= speed * 0.75 * dt;
        if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) p.x += speed * 0.75 * dt;

        p.x = Math.max(44, Math.min(w - 80, p.x));
        p.y = Math.max(44, Math.min(h - 44, p.y));
        if (p.pulseCooldown > 0) p.pulseCooldown = Math.max(0, p.pulseCooldown - dt);

        // Spawn entities
        m.spawnTimer -= dt;
        if (m.spawnTimer <= 0) {
          m.spawnTimer = Math.max(0.38, 1.05 - m.wave * 0.08);
          const roll = Math.random();
          const kind: Entity['kind'] = roll < 0.45 ? 'paper' : roll < 0.62 ? 'gold' : 'duplicate';
          entitiesRef.current.push({
            id: m.nextId++,
            x: w + 32,
            y: 44 + Math.random() * (h - 88),
            vx: -(165 + m.wave * 24 + Math.random() * 55),
            vy: kind === 'duplicate' ? (Math.random() - 0.5) * 45 : 0,
            kind,
            radius: kind === 'gold' ? 18 : 20,
            label: kind === 'paper' ? 'DOC' : kind === 'gold' ? 'PRISMA' : 'DUP!',
          });
        }

        // Update entities & collisions
        const surviving: Entity[] = [];
        for (const ent of entitiesRef.current) {
          ent.x += ent.vx * dt;
          ent.y = Math.max(36, Math.min(h - 36, ent.y + ent.vy * dt));
          if (ent.x < -50) continue;

          const dist = Math.hypot(ent.x - p.x, ent.y - p.y);
          if (dist < ent.radius + 22) {
            if (ent.kind === 'paper' || ent.kind === 'gold') {
              const pts = ent.kind === 'gold' ? 250 : 100;
              m.score += pts;
              m.collected += 1;
              m.wave = 1 + Math.floor(m.collected / 8);
              setScore(m.score);
              setCollectedCount(m.collected);
              setWave(m.wave);
              setBestScore((prev) => Math.max(prev, m.score));
              playTone(ent.kind === 'gold' ? 880 : 587.33, 0.12, 'sine');
              popupsRef.current.push({
                x: ent.x,
                y: ent.y - 14,
                text: `+${pts}`,
                life: 0.75,
                color: ent.kind === 'gold' ? '#F59E0B' : '#10B981',
              });
              particlesRef.current.push(
                ...Array.from({ length: 7 }, (_, i) => {
                  const a = (i / 7) * Math.PI * 2;
                  return {
                    x: ent.x,
                    y: ent.y,
                    vx: Math.cos(a) * 80,
                    vy: Math.sin(a) * 80,
                    life: 0.4,
                    color: ent.kind === 'gold' ? '#F59E0B' : '#10B981',
                  };
                })
              );
            } else {
              m.integrity = Math.max(0, m.integrity - 25);
              setIntegrity(m.integrity);
              playTone(170, 0.22, 'sawtooth', 0.07);
              popupsRef.current.push({
                x: ent.x,
                y: ent.y - 14,
                text: '-25% INTEGRITY',
                life: 0.85,
                color: '#DC2626',
              });
              if (m.integrity <= 0) {
                setGameState('GAME_OVER');
              }
            }
            continue;
          }
          surviving.push(ent);
        }
        entitiesRef.current = surviving;
      }

      // Draw entities (30% structural cards + 10% focal accents)
      for (const ent of entitiesRef.current) {
        ctx.save();
        if (ent.kind === 'duplicate') {
          ctx.fillStyle = '#DC2626';
          ctx.beginPath();
          ctx.arc(ent.x, ent.y, ent.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FCA5A5';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = ent.kind === 'gold' ? '#F59E0B' : '#FFFFFF';
          ctx.beginPath();
          ctx.roundRect(ent.x - 16, ent.y - 20, 32, 40, 6);
          ctx.fill();
          ctx.strokeStyle = ent.kind === 'gold' ? '#FEF3C7' : '#10B981';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.fillStyle = ent.kind === 'paper' ? '#0F172A' : '#FFFFFF';
        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ent.label, ent.x, ent.y + 3);
        ctx.restore();
      }

      // Update & draw particles
      particlesRef.current = particlesRef.current.filter((pt) => {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) return false;
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.life * 2);
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        ctx.globalAlpha = 1;
        return true;
      });

      // Draw player UAV sprite
      const p = playerRef.current;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, -14);
      ctx.lineTo(20, 14);
      ctx.moveTo(-20, 14);
      ctx.lineTo(20, -14);
      ctx.stroke();

      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.roundRect(-14, -9, 28, 18, 6);
      ctx.fill();
      ctx.fillStyle = '#10B981';
      ctx.beginPath();
      ctx.arc(8, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Update & draw floating score popups
      popupsRef.current = popupsRef.current.filter((pop) => {
        pop.y -= 32 * dt;
        pop.life -= dt;
        if (pop.life <= 0) return false;
        ctx.fillStyle = pop.color;
        ctx.font = 'bold 12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, pop.life * 1.4);
        ctx.fillText(pop.text, pop.x, pop.y);
        ctx.globalAlpha = 1;
        return true;
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING' || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleY = canvasRef.current.height / rect.height;
    playerRef.current.targetY = Math.max(40, Math.min(canvasRef.current.height - 40, (e.clientY - rect.top) * scaleY));
  };

  return (
    <div className="relative w-full h-[480px] rounded-2xl overflow-hidden border border-slate-800 bg-[#0A192F] select-none">
      <canvas
        ref={canvasRef}
        width={900}
        height={480}
        onPointerMove={handleCanvasPointer}
        onPointerDown={handleCanvasPointer}
        className="w-full h-full object-contain cursor-crosshair"
      />

      {/* Compact Corner HUD (< 8% footprint, tabular numerals + explicit text labels) */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-700 text-xs font-semibold tabular-nums">
          <span className="text-emerald-400">SCORE: {score}</span>
          <span className="text-slate-300">PAPERS: {collectedCount}</span>
          <span className="text-amber-400">WAVE {wave}</span>
          <span className={integrity <= 25 ? 'text-rose-400' : 'text-sky-300'}>
            INTEGRITY: {integrity}%
          </span>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            title={muted ? 'Unmute SFX' : 'Mute SFX'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {gameState === 'PLAYING' && (
            <button
              type="button"
              onClick={() => setGameState('PAUSED')}
              className="p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              title="Pause"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Title Screen Overlay */}
      {gameState === 'TITLE_MENU' && (
        <div className="absolute inset-0 bg-slate-950/85 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
              PRISMA Field Dash • 2D Research Arcade
            </div>
            <h3 className="text-xl font-extrabold text-white">Collect Verified Evidence</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Move with <span className="text-white font-semibold">W/S or Arrow Keys</span> (or hover/touch). Collect{' '}
              <span className="text-emerald-300 font-semibold">DOC (+100)</span> &{' '}
              <span className="text-amber-300 font-semibold">PRISMA (+250)</span> records, avoid{' '}
              <span className="text-rose-300 font-semibold">DUP!</span> noise, and press{' '}
              <span className="text-sky-300 font-semibold">SPACE</span> to trigger a Deduplication Scan Pulse!
            </p>
            <button
              type="button"
              onClick={resetAndStart}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Play className="w-4 h-4" />
              Start Game
            </button>
          </div>
        </div>
      )}

      {/* Paused Overlay */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center space-y-4 max-w-xs w-full">
            <h3 className="text-lg font-bold text-white">Game Paused</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGameState('PLAYING')}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={resetAndStart}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 bg-slate-950/85 flex items-center justify-center p-6">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <Award className="w-10 h-10 text-amber-400 mx-auto" />
            <h3 className="text-xl font-extrabold text-white">Survey Run Complete</h3>
            <div className="grid grid-cols-3 gap-2 text-xs bg-slate-950 rounded-xl p-3 border border-slate-800 tabular-nums">
              <div>
                <p className="text-slate-400">Score</p>
                <p className="text-white font-bold text-sm">{score}</p>
              </div>
              <div>
                <p className="text-slate-400">Papers</p>
                <p className="text-emerald-400 font-bold text-sm">{collectedCount}</p>
              </div>
              <div>
                <p className="text-slate-400">Best</p>
                <p className="text-amber-400 font-bold text-sm">{bestScore}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetAndStart}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
