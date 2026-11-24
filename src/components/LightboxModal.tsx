import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clapperboard,
  Download,
  Loader2,
  Maximize2,
  Scissors,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { MediaShot } from '../types/studio';
import { grabVideoFrame } from '../utils/frameGrabber';
import { upscaleImageTo4K } from '../utils/upscaler';

interface LightboxModalProps {
  shot: MediaShot | null;
  mediaUrl?: string;
  onClose: () => void;
  onInjectStartFrame: (dataUrl: string, sourceLabel: string) => void;
  onInjectEndFrame: (dataUrl: string, sourceLabel: string) => void;
  onUpdateSubtitle: (shot: MediaShot, subtitle: string) => void;
  onOmniTurn: (shot: MediaShot, turnPrompt: string, turnAction: 'edit' | 'extend') => void;
  onFreeDirectorTurn: (
    shot: MediaShot,
    turnPrompt: string,
    turnAction: 'edit' | 'extend',
    frameDataUrl?: string
  ) => void;
  onSyncFreeFoley: (shot: MediaShot) => Promise<void>;
  onDownload: (shot: MediaShot) => void;
}

export function LightboxModal({
  shot,
  mediaUrl,
  onClose,
  onInjectStartFrame,
  onInjectEndFrame,
  onUpdateSubtitle,
  onOmniTurn,
  onFreeDirectorTurn,
  onSyncFreeFoley,
  onDownload,
}: LightboxModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [syncingFoley, setSyncingFoley] = useState(false);
  const [notice, setNotice] = useState('');
  const [turnPrompt, setTurnPrompt] = useState('');

  useEffect(() => {
    if (!shot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shot, onClose]);

  if (!shot || !mediaUrl) return null;

  const handleGrab = async (position: 'current' | 'last') => {
    const vid = videoRef.current;
    if (!vid) return;
    setExtracting(true);
    setNotice('');
    try {
      const frame = await grabVideoFrame(vid, position);
      onInjectStartFrame(frame.dataUrl, `${shot.label} (${position} frame @ ${frame.timestampSec.toFixed(2)}s)`);
      onClose();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Frame extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handle4KUpscaleDownload = async () => {
    if (!mediaUrl || upscaling) return;
    setUpscaling(true);
    setNotice('');
    try {
      const { blob, width, height } = await upscaleImageTo4K(mediaUrl, 3840);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${shot.label.toLowerCase()}_4k_${width}x${height}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setNotice(`Exported crisp ${width}×${height} 4K Cinema PNG ($0)`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '4K upscale failed');
    } finally {
      setUpscaling(false);
    }
  };

  const handleSyncFoley = async () => {
    if (syncingFoley) return;
    setSyncingFoley(true);
    setNotice('');
    try {
      await onSyncFreeFoley(shot);
      setNotice('Synced frame-accurate AI Foley audio ($0 MMAudio)!');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'MMAudio ZeroGPU busy — try again in a moment');
    } finally {
      setSyncingFoley(false);
    }
  };

  const handleUniversalTurn = async (action: 'edit' | 'extend') => {
    const promptVal =
      turnPrompt.trim() ||
      (action === 'extend'
        ? `Continue seamlessly from ${shot.label}: ${shot.rawPrompt}`
        : '');
    if (!promptVal) return;

    if (shot.omniInteractionId) {
      onOmniTurn(shot, promptVal, action);
      setTurnPrompt('');
      onClose();
      return;
    }

    setExtracting(true);
    setNotice('');
    try {
      let frameDataUrl = shot.thumbnailDataUrl;
      if (shot.kind === 'video' && videoRef.current) {
        const grabbed = await grabVideoFrame(
          videoRef.current,
          action === 'extend' ? 'last' : 'current'
        );
        frameDataUrl = grabbed.dataUrl;
      }
      onFreeDirectorTurn(shot, promptVal, action, frameDataUrl);
      setTurnPrompt('');
      onClose();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not extract continuity frame');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col lg:flex-row shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Theater Canvas */}
        <div className="flex-1 bg-black flex flex-col items-center justify-center relative min-h-[280px]">
          {shot.kind === 'video' ? (
            <video
              ref={videoRef}
              src={mediaUrl}
              controls
              autoPlay
              loop
              crossOrigin="anonymous"
              className="w-full max-h-[70vh] object-contain"
            />
          ) : (
            <img
              src={mediaUrl}
              alt={shot.rawPrompt}
              className="w-full max-h-[70vh] object-contain"
            />
          )}

          {/* Continuity Action Ribbon */}
          <div className="w-full p-3 bg-zinc-950/95 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {shot.kind === 'video' ? (
                <>
                  <button
                    type="button"
                    disabled={extracting}
                    onClick={() => void handleGrab('current')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Grab Current Frame → Next Scene
                  </button>
                  <button
                    type="button"
                    disabled={extracting}
                    onClick={() => void handleGrab('last')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-amber-500/40 text-amber-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Grab Last Frame → Next Scene
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onInjectStartFrame(shot.thumbnailDataUrl || mediaUrl, shot.label);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-400 text-zinc-950 hover:bg-amber-300"
                  >
                    <Clapperboard className="w-3.5 h-3.5" />
                    Animate This Keyframe → I2V
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onInjectEndFrame(shot.thumbnailDataUrl || mediaUrl, shot.label);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-500/15 border border-violet-500/40 text-violet-200 hover:bg-violet-500/25"
                  >
                    Use as End Frame
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {shot.kind === 'image' ? (
                <button
                  type="button"
                  data-testid="upscale-4k-btn"
                  disabled={upscaling}
                  onClick={() => void handle4KUpscaleDownload()}
                  title="Stepped Lanczos + Unsharp Mask 4K Cinema Export ($0 local)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {upscaling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                  4K Export ($0)
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="sync-foley-btn"
                  disabled={syncingFoley}
                  onClick={() => void handleSyncFoley()}
                  title="Generate frame-synced AI sound effects & cinema foley via Free MMAudio ($0)"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50 ${
                    shot.hasSyncedAudio
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200 hover:bg-emerald-500/30'
                      : 'bg-sky-500/15 border-sky-500/40 text-sky-200 hover:bg-sky-500/25'
                  }`}
                >
                  {syncingFoley ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : shot.hasSyncedAudio ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  {shot.hasSyncedAudio ? 'Re-Sync AI Foley ($0)' : 'Sync AI Foley ($0)'}
                </button>
              )}

              <button
                type="button"
                onClick={() => onDownload(shot)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>
          {notice && (
            <div className="text-xs text-emerald-300 px-3 pb-2">{notice}</div>
          )}
        </div>

        {/* Right Shot Recipe Inspector */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-zinc-800 p-4 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-xs font-mono font-bold rounded bg-amber-500/15 text-amber-300">
                {shot.label}
              </span>
              <span className="text-xs text-zinc-400 uppercase">{shot.mode}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Raw Prompt
            </div>
            <p className="text-xs text-zinc-200 leading-relaxed">{shot.rawPrompt}</p>
          </div>

          {shot.compiledPrompt !== shot.rawPrompt && (
            <div className="space-y-1 p-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <div className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Compiled Prompt ({shot.appliedTags.join(', ')})
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed">{shot.compiledPrompt}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
              <div className="text-[10px] text-zinc-500">Seed</div>
              <div className="font-mono text-zinc-200">{shot.seed}</div>
            </div>
            <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
              <div className="text-[10px] text-zinc-500">Resolution</div>
              <div className="font-mono text-zinc-200">
                {shot.width}×{shot.height}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
              <div className="text-[10px] text-zinc-500">Steps / CFG</div>
              <div className="font-mono text-zinc-200">
                {shot.steps} / {shot.cfgScale}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
              <div className="text-[10px] text-zinc-500">Engine</div>
              <div className="truncate text-zinc-200" title={shot.model}>
                {shot.model}
              </div>
            </div>
          </div>

          {shot.negativePrompt && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Negative Prompt
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{shot.negativePrompt}</p>
            </div>
          )}

          {/* Universal Turn-by-Turn Edit & Seamless Extend Studio ($0 Wan 2.2 / LTX Auto-Chain OR Omni 1.2) */}
          <div
            data-testid="director-turn-panel"
            className={`space-y-2 p-2.5 rounded-xl border ${
              shot.omniInteractionId
                ? 'bg-sky-500/10 border-sky-500/30'
                : 'bg-emerald-500/8 border-emerald-500/30'
            }`}
          >
            <div
              className={`text-[11px] font-semibold flex items-center justify-between gap-1 ${
                shot.omniInteractionId ? 'text-sky-300' : 'text-emerald-300'
              }`}
            >
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {shot.omniInteractionId
                  ? 'Omni 1.2 Turn-by-Turn Edit / Extend'
                  : 'Director Turn-by-Turn Edit & Extend ($0)'}
              </span>
              {!shot.omniInteractionId && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-200">
                  FREE
                </span>
              )}
            </div>
            <input
              type="text"
              data-testid="director-turn-input"
              value={turnPrompt}
              onChange={(e) => setTurnPrompt(e.target.value)}
              placeholder={
                shot.kind === 'video'
                  ? 'e.g. "Camera pulls back into neon rain, keep @MIRA exact"'
                  : 'e.g. "Change lighting to golden sunset, keep @MIRA exact"'
              }
              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 outline-none"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="free-edit-btn"
                disabled={extracting || !turnPrompt.trim()}
                onClick={() => void handleUniversalTurn('edit')}
                className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-40 ${
                  shot.omniInteractionId
                    ? 'bg-sky-400 text-zinc-950 hover:bg-sky-300'
                    : 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300'
                }`}
              >
                {shot.kind === 'video' ? 'Re-Direct ($0)' : 'Edit / Restyle ($0)'}
              </button>
              <button
                type="button"
                data-testid="free-extend-btn"
                disabled={extracting}
                onClick={() => void handleUniversalTurn('extend')}
                title="Auto-grabs last frame, queues seamless Wan 2.2/LTX clip, and chains it into Storyboard Cut ($0)"
                className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-900 border hover:bg-zinc-800 disabled:opacity-40 ${
                  shot.omniInteractionId
                    ? 'border-sky-500/40 text-sky-200'
                    : 'border-emerald-500/40 text-emerald-200'
                }`}
              >
                {shot.omniInteractionId
                  ? 'Extend +10s'
                  : shot.kind === 'video'
                  ? '+5s Extend Chain'
                  : 'Animate +5s ($0)'}
              </button>
            </div>
          </div>

          {/* Per-Shot Subtitle / Caption (burned into Storyboard export + .SRT) */}
          <div className="space-y-1.5 pt-2 border-t border-zinc-800">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Scene Subtitle / Caption (Burned into Export + .SRT)
            </label>
            <input
              type="text"
              data-testid="lightbox-subtitle-input"
              value={shot.subtitle ?? ''}
              onChange={(e) => onUpdateSubtitle(shot, e.target.value)}
              placeholder='e.g. "Midnight in Manila — the rain never stops."'
              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/50 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
