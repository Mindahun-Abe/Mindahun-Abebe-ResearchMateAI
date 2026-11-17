import React, { useRef, useState, useEffect } from 'react';
import {
  FileAudio,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Radio,
  Square,
  Upload,
} from 'lucide-react';

function floatTo16BitPcmBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

export const AudioVoiceStudioPanel: React.FC = () => {
  // Mode 1: Transcription (gemini-3.5-transcribe)
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcribeError, setTranscribeError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Mode 2: Real-Time Live Voice (gemini-3.8-live)
  const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [liveTranscripts, setLiveTranscripts] = useState<{ who: string; text: string }[]>([]);
  const [liveError, setLiveError] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const liveActiveRef = useRef<boolean>(false);

  const transcribeBlob = async (blob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    setTranscribeError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read audio bytes'));
        reader.readAsDataURL(blob);
      });

      const res = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: mimeType || 'audio/webm',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');
      setTranscript(data.transcript || 'No speech detected in audio.');
    } catch (err: any) {
      setTranscribeError(err?.message || 'Unable to transcribe audio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleToggleClipRecord = async () => {
    if (isRecordingClip) {
      mediaRecorderRef.current?.stop();
      setIsRecordingClip(false);
      return;
    }

    setTranscribeError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        transcribeBlob(blob, recorder.mimeType || 'audio/webm');
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingClip(true);
    } catch (err: any) {
      setTranscribeError(err?.message || 'Microphone access denied or unavailable.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    transcribeBlob(file, file.type || 'audio/mp3');
  };

  const stopLiveSession = () => {
    liveActiveRef.current = false;
    setLiveState('idle');
    try {
      processorRef.current?.disconnect();
      processorRef.current = null;
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    } catch {}
    try {
      inputCtxRef.current?.close();
      inputCtxRef.current = null;
    } catch {}
    try {
      activeSourcesRef.current.forEach((s) => s.stop());
      activeSourcesRef.current = [];
      outputCtxRef.current?.close();
      outputCtxRef.current = null;
    } catch {}
    try {
      wsRef.current?.close();
      wsRef.current = null;
    } catch {}
    nextStartTimeRef.current = 0;
  };

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  const startLiveSession = async () => {
    setLiveError('');
    setLiveState('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        liveActiveRef.current = true;
        setLiveState('connected');
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (ev) => {
          if (!liveActiveRef.current || ws.readyState !== WebSocket.OPEN) return;
          const base64 = floatTo16BitPcmBase64(ev.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.error) {
            setLiveError(msg.error);
            stopLiveSession();
            return;
          }
          if (msg.inputTranscript) {
            setLiveTranscripts((prev) => [...prev, { who: 'You', text: msg.inputTranscript }]);
          }
          if (msg.outputTranscript) {
            setLiveTranscripts((prev) => [...prev, { who: 'Gemini Live', text: msg.outputTranscript }]);
          }
          if (msg.interrupted && outputCtxRef.current) {
            activeSourcesRef.current.forEach((s) => {
              try {
                s.stop();
              } catch {}
            });
            activeSourcesRef.current = [];
            nextStartTimeRef.current = outputCtxRef.current.currentTime;
          }
          if (msg.audio && outputCtxRef.current) {
            const floatSamples = base64PcmToFloat32(msg.audio);
            const audioBuffer = outputCtxRef.current.createBuffer(1, floatSamples.length, 24000);
            audioBuffer.getChannelData(0).set(floatSamples);

            const srcNode = outputCtxRef.current.createBufferSource();
            srcNode.buffer = audioBuffer;
            srcNode.connect(outputCtxRef.current.destination);

            const startAt = Math.max(outputCtxRef.current.currentTime, nextStartTimeRef.current);
            srcNode.start(startAt);
            nextStartTimeRef.current = startAt + audioBuffer.duration;
            activeSourcesRef.current.push(srcNode);
          }
        } catch (err) {
          console.warn('Live WS parse warning:', err);
        }
      };

      ws.onerror = () => {
        setLiveError('Live WebSocket connection encountered an error.');
        stopLiveSession();
      };

      ws.onclose = () => {
        if (liveActiveRef.current) {
          stopLiveSession();
        }
      };
    } catch (err: any) {
      setLiveError(err?.message || 'Microphone permission or Live API initialization failed.');
      stopLiveSession();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Left: Audio Transcription */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-teal-400" />
              <span>Audio Transcription</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Record field memos or upload audio clips for accurate transcription (`gemini-3.5-transcribe`)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleClipRecord}
            disabled={isTranscribing}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition ${
              isRecordingClip
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-teal-600 hover:bg-teal-500 text-white'
            }`}
          >
            {isRecordingClip ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{isRecordingClip ? 'Stop & Transcribe' : 'Record Microphone'}</span>
          </button>

          <label className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 inline-flex items-center gap-2 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Audio File</span>
            <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {isTranscribing && (
          <div className="flex items-center gap-2 text-xs text-teal-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Transcribing audio with Gemini...</span>
          </div>
        )}

        {transcribeError && (
          <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-xs text-rose-200">
            {transcribeError}
          </div>
        )}

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={9}
          placeholder="Your transcription will appear here..."
          className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 leading-relaxed"
        />
      </div>

      {/* Right: Real-Time Bidirectional Voice */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-400" />
              <span>Real-Time Voice Conversation</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Low-latency duplex voice session powered by `gemini-3.8-live` (16kHz input / 24kHz audio playback)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {liveState === 'idle' ? (
            <button
              type="button"
              onClick={startLiveSession}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Start Live Voice Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopLiveSession}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Voice Session</span>
            </button>
          )}

          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
              liveState === 'connected'
                ? 'text-emerald-400'
                : liveState === 'connecting'
                ? 'text-amber-300'
                : 'text-slate-500'
            }`}
          >
            {liveState === 'connected' ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            <span>
              {liveState === 'connected'
                ? 'Live Microphone Streaming'
                : liveState === 'connecting'
                ? 'Connecting Session...'
                : 'Session Standby'}
            </span>
          </span>
        </div>

        {liveError && (
          <div className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-xs text-rose-200">
            {liveError}
          </div>
        )}

        <div className="flex-1 min-h-[210px] max-h-[280px] overflow-y-auto p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          {liveTranscripts.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-12">
              Start a voice session and speak naturally to discuss review criteria, study screening, or synthesis questions.
            </p>
          ) : (
            liveTranscripts.map((item, idx) => (
              <div key={idx} className="text-xs leading-relaxed">
                <span
                  className={`font-bold mr-2 ${
                    item.who === 'You' ? 'text-indigo-400' : 'text-teal-400'
                  }`}
                >
                  {item.who}:
                </span>
                <span className="text-slate-200">{item.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
