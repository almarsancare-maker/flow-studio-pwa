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
import { blobToDataUrl, grabVideoFrame } from '../utils/frameGrabber';
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

  const resolveImageDataUrl = async (): Promise<string | null> => {
    if (shot.thumbnailDataUrl?.startsWith('data:image/')) return shot.thumbnailDataUrl;
    if (mediaUrl.startsWith('data:image/')) return mediaUrl;
    try {
      const resp = await fetch(mediaUrl);
      const blob = await resp.blob();
      return await blobToDataUrl(blob);
    } catch {
      return null;
    }
  };

  const handleInjectStill = async (target: 'start' | 'end') => {
    const dataUrl = await resolveImageDataUrl();
    if (!dataUrl) {
      setNotice('Could not encode still frame for I2V.');
      return;
    }
    if (target === 'start') onInjectStartFrame(dataUrl, shot.label);
    else onInjectEndFrame(dataUrl, shot.label);
    onClose();
  };

  const handleGrab = async (position: 'current' | 'last') => {
    const vid = videoRef.current;
    if (!vid) return;
    setExtracting(true);
    setNotice('');
    try {
      const frame = await grabVideoFrame(vid, position);
      onInjectStartFrame(
        frame.dataUrl,
        `${shot.label} (${position} frame @ ${frame.timestampSec.toFixed(2)}s)`
      );
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
      (action === 'extend' ? `Continue seamlessly from ${shot.label}: ${shot.rawPrompt}` : '');
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
      className="fixed inset-0 z-[1050] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        data-testid="flow-modal-surface"
        className="flow-modal w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col lg:flex-row"
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
          <div className="w-full p-3.5 bg-[#131314] border-t border-white/15 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {shot.kind === 'video' ? (
                <>
                  <button
                    type="button"
                    disabled={extracting}
                    onClick={() => void handleGrab('current')}
                    className="flow-cta-primary flex items-center gap-1.5 px-3.5 py-2 text-[12px] disabled:opacity-45 cursor-pointer"
                  >
                    <Scissors className="w-3.5 h-3.5 stroke-[1.7]" />
                    Grab Current Frame → Next
                  </button>
                  <button
                    type="button"
                    disabled={extracting}
                    onClick={() => void handleGrab('last')}
                    className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium disabled:opacity-45 cursor-pointer"
                  >
                    <Scissors className="w-3.5 h-3.5 stroke-[1.6]" />
                    Grab Last Frame → Next
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleInjectStill('start')}
                    className="flow-cta-primary flex items-center gap-1.5 px-4 py-2 text-[12px] cursor-pointer"
                  >
                    <Clapperboard className="w-3.5 h-3.5 stroke-[1.7]" />
                    Animate Keyframe → I2V
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInjectStill('end')}
                    className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium cursor-pointer"
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
                  className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium disabled:opacity-45 cursor-pointer"
                >
                  {upscaling ? (
                    <Loader2 className="w-3.5 h-3.5 stroke-[1.6] animate-spin" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5 stroke-[1.6]" />
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
                  className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium disabled:opacity-45 cursor-pointer"
                >
                  {syncingFoley ? (
                    <Loader2 className="w-3.5 h-3.5 stroke-[1.6] animate-spin" />
                  ) : shot.hasSyncedAudio ? (
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[1.6] text-[#29c58f]" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 stroke-[1.6]" />
                  )}
                  {shot.hasSyncedAudio ? 'Re-Sync AI Foley ($0)' : 'Sync AI Foley ($0)'}
                </button>
              )}

              <button
                type="button"
                onClick={() => onDownload(shot)}
                className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 stroke-[1.6]" />
                Download
              </button>
            </div>
          </div>
          {notice && (
            <div className="text-[12px] text-[#29c58f] px-4 pb-2.5 bg-[#131314] w-full">
              {notice}
            </div>
          )}
        </div>

        {/* Right Shot Recipe Inspector */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/15 p-5 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[12px] font-mono font-medium rounded-[32px] bg-white/10 border border-white/15 text-white">
                {shot.label}
              </span>
              <span className="text-[12px] text-white/55 uppercase">{shot.mode}</span>
            </div>
            <button
              type="button"
              aria-label="Close inspector"
              onClick={onClose}
              className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[1.6]" />
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-white/45">
              Raw Prompt
            </div>
            <p className="text-[13px] text-white/90 leading-[20px]">{shot.rawPrompt}</p>
          </div>

          {shot.compiledPrompt !== shot.rawPrompt && (
            <div className="space-y-1 p-3 rounded-[14px] bg-white/5 border border-white/15">
              <div className="text-[11px] font-medium text-white flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 stroke-[1.6]" />
                Compiled Prompt ({shot.appliedTags.join(', ')})
              </div>
              <p className="text-[12px] text-white/70 leading-[18px]">{shot.compiledPrompt}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="p-2.5 rounded-[12px] bg-white/5 border border-white/15">
              <div className="text-[10px] text-white/45">Seed</div>
              <div className="font-mono text-white mt-0.5">{shot.seed}</div>
            </div>
            <div className="p-2.5 rounded-[12px] bg-white/5 border border-white/15">
              <div className="text-[10px] text-white/45">Resolution</div>
              <div className="font-mono text-white mt-0.5">
                {shot.width}×{shot.height}
              </div>
            </div>
            <div className="p-2.5 rounded-[12px] bg-white/5 border border-white/15">
              <div className="text-[10px] text-white/45">Steps / CFG</div>
              <div className="font-mono text-white mt-0.5">
                {shot.steps} / {shot.cfgScale}
              </div>
            </div>
            <div className="p-2.5 rounded-[12px] bg-white/5 border border-white/15">
              <div className="text-[10px] text-white/45">Engine</div>
              <div className="truncate text-white mt-0.5" title={shot.model}>
                {shot.model}
              </div>
            </div>
          </div>

          {shot.negativePrompt && (
            <div className="space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-white/45">
                Negative Prompt
              </div>
              <p className="text-[12px] text-white/55 leading-[18px]">{shot.negativePrompt}</p>
            </div>
          )}

          {/* Universal Turn-by-Turn Edit & Seamless Extend Studio */}
          <div
            data-testid="director-turn-panel"
            className="space-y-2.5 p-3.5 rounded-[16px] bg-white/5 border border-white/15"
          >
            <div className="text-[12px] font-medium text-white flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 stroke-[1.6]" />
                {shot.omniInteractionId
                  ? 'Omni 1.2 Turn-by-Turn Edit / Extend'
                  : 'Director Turn-by-Turn Edit ($0)'}
              </span>
              {!shot.omniInteractionId && (
                <span className="text-[10px] px-2 py-0.5 rounded-[32px] bg-white/10 text-[#29c58f] font-medium">
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
              className="flow-input w-full px-3 py-2 text-[12px]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="free-edit-btn"
                disabled={extracting || !turnPrompt.trim()}
                onClick={() => void handleUniversalTurn('edit')}
                className="flow-cta-primary flex-1 px-3 py-2 text-[12px] disabled:opacity-40 cursor-pointer"
              >
                {shot.kind === 'video' ? 'Re-Direct ($0)' : 'Edit / Restyle ($0)'}
              </button>
              <button
                type="button"
                data-testid="free-extend-btn"
                disabled={extracting}
                onClick={() => void handleUniversalTurn('extend')}
                title="Auto-grabs last frame, queues seamless Wan 2.2/LTX clip, and chains it into Storyboard Cut ($0)"
                className="flow-btn-glass flex-1 px-3 py-2 text-[12px] font-medium disabled:opacity-40 cursor-pointer"
              >
                {shot.omniInteractionId
                  ? 'Extend +10s'
                  : shot.kind === 'video'
                  ? '+5s Extend'
                  : 'Animate +5s'}
              </button>
            </div>
          </div>

          {/* Per-Shot Subtitle / Caption */}
          <div className="space-y-1.5 pt-3 border-t border-white/15">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-white/50">
              Scene Subtitle / Caption (.SRT + Burn-in)
            </label>
            <input
              type="text"
              data-testid="lightbox-subtitle-input"
              value={shot.subtitle ?? ''}
              onChange={(e) => onUpdateSubtitle(shot, e.target.value)}
              placeholder='e.g. "Midnight in Manila — the rain never stops."'
              className="flow-input w-full px-3 py-2 text-[12px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
