import React, { useState, useRef, useEffect } from 'react';
import { ReviewProject } from '../../types';
import {
  Image as ImageIcon,
  Film,
  Download,
  Upload,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  Sliders,
  Video,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface VisualMediaStudioPanelProps {
  project: ReviewProject;
}

type StudioSubTab = 'image_studio' | 'video_studio';
type ImageTemplateId = 'prisma_card' | 'uav_survey' | 'evidence_chart' | 'custom_upload';

interface StoryboardScene {
  headline: string;
  caption: string;
  visualMotif: 'terrain' | 'network' | 'uav' | 'chart';
  durationSec: number;
}

interface StoryboardPayload {
  title: string;
  palette: { bg: string; accent: string; secondary: string };
  scenes: StoryboardScene[];
}

const PALETTES: Record<string, { name: string; bg1: string; bg2: string; accent: string; text: string }> = {
  indigo_slate: {
    name: 'Academic Slate & Indigo',
    bg1: '#0f172a',
    bg2: '#1e1b4b',
    accent: '#6366f1',
    text: '#f8fafc',
  },
  emerald_teal: {
    name: 'Environmental Teal & Emerald',
    bg1: '#042f2e',
    bg2: '#0f172a',
    accent: '#10b981',
    text: '#ecfdf5',
  },
  amber_obsidian: {
    name: 'Journal Warm Obsidian',
    bg1: '#18181b',
    bg2: '#27272a',
    accent: '#f59e0b',
    text: '#fffbeb',
  },
  clean_light: {
    name: 'Publication Light Canvas',
    bg1: '#f8fafc',
    bg2: '#e2e8f0',
    accent: '#2563eb',
    text: '#0f172a',
  },
};

export const VisualMediaStudioPanel: React.FC<VisualMediaStudioPanelProps> = ({ project }) => {
  const [subTab, setSubTab] = useState<StudioSubTab>('image_studio');

  // --- Image Studio State ---
  const [imgTemplate, setImgTemplate] = useState<ImageTemplateId>('prisma_card');
  const [imgPromptTitle, setImgPromptTitle] = useState<string>(
    project.title || 'Systematic Evidence Synthesis Diagram'
  );
  const [imgSubtitle, setImgSubtitle] = useState<string>(
    `${project.frameworkType || 'PICOC'} Protocol • ${(project.articles || []).filter((a) => a.decision === 'include').length} Included Studies`
  );
  const [paletteKey, setPaletteKey] = useState<string>('indigo_slate');
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);
  const [uploadedImg, setUploadedImg] = useState<HTMLImageElement | null>(null);
  const [imgStatus, setImgStatus] = useState<string>('');
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Video Storyboard State ---
  const [videoPrompt, setVideoPrompt] = useState<string>(
    `Visual research abstract for ${project.title}: UAV remote sensing pipeline, PRISMA screening funnel, and quantitative evidence synthesis.`
  );
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [storyboard, setStoryboard] = useState<StoryboardPayload | null>(null);
  const [isGeneratingBoard, setIsGeneratingBoard] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isExportingWebm, setIsExportingWebm] = useState<boolean>(false);
  const [playTimeSec, setPlayTimeSec] = useState<number>(0);

  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRafRef = useRef<number>(0);

  // Render Image Studio Canvas cleanly on any change
  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const pal = PALETTES[paletteKey] || PALETTES.indigo_slate;

    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, pal.bg1);
    grad.addColorStop(1, pal.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (imgTemplate === 'custom_upload' && uploadedImg) {
      const scale = Math.min(w / uploadedImg.width, h / uploadedImg.height);
      const dw = uploadedImg.width * scale;
      const dh = uploadedImg.height * scale;
      ctx.drawImage(uploadedImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
      // Dark bottom scrim for legible caption
      const scrim = ctx.createLinearGradient(0, h * 0.62, 0, h);
      scrim.addColorStop(0, 'rgba(0,0,0,0)');
      scrim.addColorStop(1, 'rgba(2,6,23,0.86)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
    } else {
      // Subtle scientific coordinate grid
      ctx.strokeStyle = paletteKey === 'clean_light' ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (imgTemplate === 'prisma_card') {
        const total = (project.articles || []).length;
        const dupes = (project.articles || []).filter((a) => a.isDuplicate).length;
        const screened = Math.max(total - dupes, 0);
        const included = (project.articles || []).filter((a) => a.decision === 'include').length;
        const excluded = (project.articles || []).filter((a) => a.decision === 'exclude').length;

        const boxes = [
          { label: 'IDENTIFIED', val: `${total} Records`, x: 110, y: 180, color: '#6366f1' },
          { label: 'SCREENED', val: `${screened} Unique`, x: 355, y: 180, color: '#3b82f6' },
          { label: 'EXCLUDED', val: `${excluded} Filtered`, x: 600, y: 180, color: '#f43f5e' },
          { label: 'INCLUDED', val: `${included} Studies`, x: 845, y: 180, color: '#10b981' },
        ];
        boxes.forEach((b, idx) => {
          ctx.fillStyle = paletteKey === 'clean_light' ? '#ffffff' : 'rgba(15,23,42,0.85)';
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, 195, 130, 16);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = b.color;
          ctx.font = 'bold 13px Inter, system-ui, sans-serif';
          ctx.fillText(b.label, b.x + 20, b.y + 42);

          ctx.fillStyle = pal.text;
          ctx.font = 'bold 26px Inter, system-ui, sans-serif';
          ctx.fillText(b.val, b.x + 20, b.y + 88);

          if (idx < boxes.length - 1) {
            ctx.strokeStyle = pal.accent;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(b.x + 202, b.y + 65);
            ctx.lineTo(b.x + 240, b.y + 65);
            ctx.stroke();
          }
        });
      } else if (imgTemplate === 'uav_survey') {
        // Elevation contour lines & hexacopter schematic
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2;
        for (let r = 60; r <= 240; r += 36) {
          ctx.beginPath();
          ctx.ellipse(w * 0.65, h * 0.56, r * 1.4, r * 0.65, -0.15, 0, Math.PI * 2);
          ctx.globalAlpha = 0.28;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Drone silhouette
        const dx = w * 0.65;
        const dy = h * 0.42;
        ctx.strokeStyle = pal.text;
        ctx.lineWidth = 4;
        [
          [-65, -35],
          [65, -35],
          [-65, 35],
          [65, 35],
        ].forEach(([ox, oy]) => {
          ctx.beginPath();
          ctx.moveTo(dx, dy);
          ctx.lineTo(dx + ox, dy + oy);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(dx + ox, dy + oy, 22, 0, Math.PI * 2);
          ctx.strokeStyle = pal.accent;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = pal.text;
          ctx.lineWidth = 4;
        });
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.roundRect(dx - 24, dy - 16, 48, 32, 8);
        ctx.fill();
      } else if (imgTemplate === 'evidence_chart') {
        // Publication trend bars by year from project articles
        const yearMap: Record<number, number> = {};
        (project.articles || []).forEach((a) => {
          if (a.year) yearMap[a.year] = (yearMap[a.year] || 0) + 1;
        });
        const sortedYears = Object.keys(yearMap)
          .map(Number)
          .sort((a, b) => a - b)
          .slice(-8);
        const bars =
          sortedYears.length > 0
            ? sortedYears.map((yr) => ({ label: String(yr), count: yearMap[yr] }))
            : [
                { label: '2020', count: 3 },
                { label: '2021', count: 5 },
                { label: '2022', count: 8 },
                { label: '2023', count: 11 },
                { label: '2024', count: 9 },
              ];
        const maxVal = Math.max(...bars.map((b) => b.count), 1);
        const startX = 130;
        const baseY = 440;
        const barW = Math.min(82, Math.floor(760 / bars.length) - 18);
        bars.forEach((b, idx) => {
          const bh = Math.round((b.count / maxVal) * 210);
          const bx = startX + idx * (barW + 24);
          ctx.fillStyle = pal.accent;
          ctx.beginPath();
          ctx.roundRect(bx, baseY - bh, barW, bh, [8, 8, 0, 0]);
          ctx.fill();

          ctx.fillStyle = pal.text;
          ctx.font = 'bold 16px Inter, system-ui, sans-serif';
          ctx.fillText(String(b.count), bx + barW / 2 - 8, baseY - bh - 10);
          ctx.font = '14px Inter, system-ui, sans-serif';
          ctx.fillText(b.label, bx + 4, baseY + 26);
        });
      }
    }

    // Header / Overlay Banner Text
    ctx.restore();
    const useLightText = imgTemplate === 'custom_upload' && uploadedImg ? '#ffffff' : pal.text;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(54, 48, 8, 76);

    ctx.fillStyle = useLightText;
    ctx.font = 'bold 30px Inter, system-ui, sans-serif';
    const clippedTitle = imgPromptTitle.length > 58 ? `${imgPromptTitle.slice(0, 56)}…` : imgPromptTitle;
    ctx.fillText(clippedTitle, 78, 82);

    ctx.font = '17px Inter, system-ui, sans-serif';
    ctx.globalAlpha = 0.85;
    ctx.fillText(imgSubtitle.slice(0, 88), 78, 114);
    ctx.globalAlpha = 1;
  }, [imgTemplate, imgPromptTitle, imgSubtitle, paletteKey, brightness, contrast, saturation, uploadedImg, project]);

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        setUploadedImg(image);
        setImgTemplate('custom_upload');
        setImgStatus(`Loaded "${file.name}" (${image.width}×${image.height})`);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPng = () => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `research-figure-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setImgStatus('Exported PNG figure.');
  };

  // --- Video Storyboard Generation & Rendering ---
  const handleGenerateStoryboard = async () => {
    if (!videoPrompt.trim()) return;
    setIsGeneratingBoard(true);
    setVideoError('');
    setIsPlaying(false);
    setPlayTimeSec(0);
    try {
      const resp = await fetch('/api/gemini/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt.trim(),
          aspectRatio,
          projectTitle: project.title,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Could not generate storyboard');
      setStoryboard(data);
      setIsPlaying(true);
    } catch (err: any) {
      setVideoError(err?.message || 'Storyboard generation failed.');
    } finally {
      setIsGeneratingBoard(false);
    }
  };

  const totalDurationSec = storyboard
    ? storyboard.scenes.reduce((sum, s) => sum + (Number(s.durationSec) || 2.5), 0)
    : 10;

  const drawVideoFrame = (
    canvas: HTMLCanvasElement,
    board: StoryboardPayload,
    tSec: number
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const total = board.scenes.reduce((s, x) => s + (Number(x.durationSec) || 2.5), 0) || 10;
    const wrappedT = tSec % total;

    let acc = 0;
    let sceneIdx = 0;
    let localProgress = 0;
    for (let i = 0; i < board.scenes.length; i++) {
      const d = Number(board.scenes[i].durationSec) || 2.5;
      if (wrappedT <= acc + d || i === board.scenes.length - 1) {
        sceneIdx = i;
        localProgress = Math.min(1, Math.max(0, (wrappedT - acc) / d));
        break;
      }
      acc += d;
    }

    const scene = board.scenes[sceneIdx];
    const bg = board.palette?.bg || '#090d16';
    const accent = board.palette?.accent || '#38bdf8';
    const secondary = board.palette?.secondary || '#10b981';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle radial glow
    const rad = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.45, Math.max(w, h) * 0.6);
    rad.addColorStop(0, `${accent}33`);
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, w, h);

    // Animated motif visual
    ctx.save();
    if (scene.visualMotif === 'terrain') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      for (let row = 0; row < 10; row++) {
        ctx.beginPath();
        const baseY = h * 0.48 + row * (h * 0.036);
        for (let x = 0; x <= w; x += 24) {
          const wave = Math.sin(x * 0.012 + tSec * 1.4 + row * 0.5) * 18;
          if (x === 0) ctx.moveTo(x, baseY + wave);
          else ctx.lineTo(x, baseY + wave);
        }
        ctx.globalAlpha = 0.25 + (row / 10) * 0.55;
        ctx.stroke();
      }
    } else if (scene.visualMotif === 'uav') {
      const cx = w * (0.2 + 0.6 * localProgress);
      const cy = h * 0.45 + Math.sin(tSec * 4) * 18;
      // Scan beam cone
      ctx.fillStyle = `${secondary}33`;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 16);
      ctx.lineTo(cx - 120, h * 0.8);
      ctx.lineTo(cx + 120, h * 0.8);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 56, cy);
      ctx.lineTo(cx + 56, cy);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();
    } else if (scene.visualMotif === 'network') {
      const count = 8;
      const pts = Array.from({ length: count }, (_, idx) => {
        const ang = (idx / count) * Math.PI * 2 + tSec * 0.35;
        return {
          x: w * 0.5 + Math.cos(ang) * (w * 0.22),
          y: h * 0.46 + Math.sin(ang) * (h * 0.17),
        };
      });
      ctx.strokeStyle = `${accent}66`;
      ctx.lineWidth = 2;
      pts.forEach((p, i) => {
        pts.slice(i + 1).forEach((q) => {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        });
      });
      pts.forEach((p) => {
        ctx.fillStyle = secondary;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      const bars = 6;
      const bw = Math.min(72, Math.floor((w * 0.55) / bars));
      const startX = (w - bars * (bw + 16)) / 2;
      for (let i = 0; i < bars; i++) {
        const targetH = h * (0.14 + ((i + 1) / bars) * 0.28) * Math.min(1, localProgress * 1.4);
        ctx.fillStyle = i % 2 === 0 ? accent : secondary;
        ctx.fillRect(startX + i * (bw + 16), h * 0.65 - targetH, bw, targetH);
      }
    }
    ctx.restore();

    // Text overlay strip
    ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
    ctx.fillRect(0, h - Math.round(h * 0.26), w, Math.round(h * 0.26));

    const padX = Math.round(w * 0.06);
    const textY = h - Math.round(h * 0.16);
    ctx.fillStyle = accent;
    ctx.font = `bold ${aspectRatio === '16:9' ? 20 : 18}px Inter, system-ui, sans-serif`;
    ctx.fillText(`SCENE ${sceneIdx + 1}/${board.scenes.length} • ${board.title.slice(0, 42)}`, padX, textY - 34);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${aspectRatio === '16:9' ? 32 : 26}px Inter, system-ui, sans-serif`;
    ctx.fillText(scene.headline.slice(0, 48), padX, textY + 6);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `${aspectRatio === '16:9' ? 20 : 17}px Inter, system-ui, sans-serif`;
    ctx.fillText(scene.caption.slice(0, aspectRatio === '16:9' ? 76 : 44), padX, textY + 42);

    // Bottom progress bar
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, h - 8, w, 8);
    ctx.fillStyle = secondary;
    ctx.fillRect(0, h - 8, w * (wrappedT / total), 8);
  };

  useEffect(() => {
    if (!storyboard || !videoCanvasRef.current) return;
    drawVideoFrame(videoCanvasRef.current, storyboard, playTimeSec);
  }, [storyboard, playTimeSec, aspectRatio]);

  useEffect(() => {
    if (!isPlaying || !storyboard) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      setPlayTimeSec((prev) => (prev + dt) % totalDurationSec);
      animRafRef.current = requestAnimationFrame(tick);
    };
    animRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRafRef.current);
  }, [isPlaying, storyboard, totalDurationSec]);

  const handleExportWebm = async () => {
    const canvas = videoCanvasRef.current;
    if (!canvas || !storyboard || typeof MediaRecorder === 'undefined') return;
    setIsExportingWebm(true);
    setIsPlaying(false);
    try {
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `research-storyboard-${aspectRatio.replace(':', 'x')}.webm`;
        link.click();
        URL.revokeObjectURL(url);
        setIsExportingWebm(false);
      };

      recorder.start();
      const start = performance.now();
      const durationMs = Math.min(totalDurationSec * 1000, 12000);
      const renderStep = (now: number) => {
        const elapsedSec = (now - start) / 1000;
        drawVideoFrame(canvas, storyboard, elapsedSec);
        if (now - start < durationMs) {
          requestAnimationFrame(renderStep);
        } else {
          recorder.stop();
        }
      };
      requestAnimationFrame(renderStep);
    } catch (err: any) {
      setVideoError(err?.message || 'Could not export WebM video in this browser.');
      setIsExportingWebm(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('image_studio')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'image_studio'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Create & Edit Images
          </button>
          <button
            type="button"
            onClick={() => setSubTab('video_studio')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer ${
              subTab === 'video_studio'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Film className="w-4 h-4" />
            Generate Video Storyboard (16:9 & 9:16)
          </button>
        </div>
        <span className="text-[11px] text-slate-400 px-2">
          Client-side 2D Canvas Studio + Gemini Storyboard Script
        </span>
      </div>

      {subTab === 'image_studio' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Controls Column */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Figure & Image Composer</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">Template Preset</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'prisma_card', label: 'PRISMA Summary' },
                  { id: 'uav_survey', label: 'UAV Schematic' },
                  { id: 'evidence_chart', label: 'Yearly Evidence' },
                  { id: 'custom_upload', label: 'Uploaded Photo' },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setImgTemplate(tpl.id as ImageTemplateId)}
                    className={`px-2.5 py-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                      imgTemplate === tpl.id
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">Headline Text</label>
              <input
                type="text"
                value={imgPromptTitle}
                onChange={(e) => setImgPromptTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">Subtitle / Citation Note</label>
              <input
                type="text"
                value={imgSubtitle}
                onChange={(e) => setImgSubtitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">Color Palette</label>
              <select
                value={paletteKey}
                onChange={(e) => setPaletteKey(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {Object.entries(PALETTES).map(([key, pal]) => (
                  <option key={key} value={key}>
                    {pal.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tone adjustments */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Brightness</span>
                <span className="font-mono">{brightness}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={150}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />

              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Contrast</span>
                <span className="font-mono">{contrast}%</span>
              </div>
              <input
                type="range"
                min={60}
                max={160}
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />

              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Saturation</span>
                <span className="font-mono">{saturation}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={180}
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadImage}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => imageFileInputRef.current?.click()}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Image
              </button>
              <button
                type="button"
                onClick={handleDownloadPng}
                className="flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export PNG
              </button>
            </div>

            {imgStatus && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{imgStatus}</span>
              </div>
            )}
          </div>

          {/* Preview Canvas */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center">
            <canvas
              ref={imageCanvasRef}
              width={1120}
              height={580}
              className="w-full h-auto rounded-xl border border-slate-700 shadow-lg bg-slate-950"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Video Controls */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Video className="w-4 h-4 text-emerald-400" />
              <span>Text-to-Video Storyboard Generator</span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">Research Storyboard Prompt</label>
              <textarea
                rows={4}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                placeholder="Describe the research narrative or synthesis video..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 font-semibold">Aspect Ratio</label>
              <div className="grid grid-cols-2 gap-2">
                {(['16:9', '9:16'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      aspectRatio === ratio
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {ratio === '16:9' ? '16:9 Widescreen' : '9:16 Vertical Reel'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateStoryboard}
              disabled={isGeneratingBoard}
              className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {isGeneratingBoard ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating AI Storyboard...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Animated Storyboard</span>
                </>
              )}
            </button>

            {storyboard && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlayTimeSec(0);
                      setIsPlaying(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                    title="Restart"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleExportWebm}
                    disabled={isExportingWebm}
                    className="flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isExportingWebm ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Recording...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Save .WebM</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={totalDurationSec}
                  step={0.1}
                  value={playTimeSec}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setPlayTimeSec(Number(e.target.value));
                  }}
                  className="w-full accent-emerald-500"
                />
              </div>
            )}

            {videoError && (
              <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{videoError}</span>
              </div>
            )}
          </div>

          {/* Video Canvas Player */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[380px]">
            {storyboard ? (
              <canvas
                ref={videoCanvasRef}
                width={aspectRatio === '16:9' ? 1280 : 720}
                height={aspectRatio === '16:9' ? 720 : 1280}
                className={`rounded-xl border border-slate-700 shadow-xl bg-slate-950 ${
                  aspectRatio === '16:9' ? 'w-full h-auto' : 'max-h-[440px] w-auto'
                }`}
              />
            ) : (
              <div className="text-center space-y-2 max-w-md py-12">
                <Film className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />
                <p className="text-sm font-bold text-white">Ready to Render Research Storyboard</p>
                <p className="text-xs text-slate-400">
                  Choose 16:9 Widescreen or 9:16 Vertical Reel and click &ldquo;Generate Animated Storyboard&rdquo; to synthesize a 4-scene animated brief exportable as WebM video.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
