import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="px-2.5 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/40 text-teal-200 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
        title="Install ResearchMate AI for offline desktop & Android access"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Install iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-3">
              <h3 className="text-base font-bold text-white">Install ResearchMate AI on iOS</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2 text-xs font-bold text-white cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
