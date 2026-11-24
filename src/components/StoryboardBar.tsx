import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Loader2,
  Music,
  Palette,
  Play,
  Plus,
  Subtitles,
  X,
} from 'lucide-react';
import type {
  AmbientAudioPreset,
  CinemaLut,
  MediaShot,
  TransitionStyle,
} from '../types/studio';
import {
  buildSrtSubtitles,
  LUT_CSS_FILTERS,
  stitchStoryboardSequence,
} from '../utils/sequenceStitcher';

interface StoryboardBarProps {
  clips: MediaShot[];
  blobUrls: Record<string, string>;
  projectName: string;
  onMoveClip: (shotId: string, direction: -1 | 1) => void;
  onReorderClips: (fromId: string, toId: string) => void;
  onRemoveClip: (shotId: string) => void;
  onExtendFinalClip: (lastClip: MediaShot) => void;
  onExportComplete: (message: string) => void;
}

function formatTimecode(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function StoryboardBar({
  clips,
  blobUrls,
  projectName,
  onMoveClip,
  onReorderClips,
  onRemoveClip,
  onExtendFinalClip,
  onExportComplete,
}: StoryboardBarProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [stitching, setStitching] = useState(false);
  const [stitchStatus, setStitchStatus] = useState('');
  const [stitchPct, setStitchPct] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [lut, setLut] = useState<CinemaLut>('natural');
  const [transition, setTransition] = useState<TransitionStyle>('crossfade');
  const [ambientAudio, setAmbientAudio] = useState<AmbientAudioPreset>('none');

  const activeClip = clips[previewIndex];
  const activeUrl = activeClip
    ? (activeClip.blobKey && blobUrls[activeClip.blobKey]) || activeClip.thumbnailDataUrl
    : undefined;

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen]);

  useEffect(() => {
    if (!previewOpen || !activeClip || activeClip.kind !== 'image') return;
    const timer = window.setTimeout(() => {
      setPreviewIndex((idx) => (idx + 1 < clips.length ? idx + 1 : 0));
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [previewOpen, previewIndex, activeClip, clips.length]);

  if (clips.length === 0) return null;

  const totalSeconds = clips.reduce(
    (sum, c) => sum + (c.kind === 'video' ? c.durationSec : 3),
    0
  );
  const lastClip = clips[clips.length - 1];

  const handleExportStitched = async () => {
    setStitching(true);
    setStitchPct(5);
    setStitchStatus('Preparing browser cinema renderer...');
    try {
      const inputs = clips
        .map((c) => {
          const srcUrl = (c.blobKey && blobUrls[c.blobKey]) || c.thumbnailDataUrl || '';
          return {
            id: c.id,
            label: c.label,
            kind: c.kind,
            srcUrl,
            stillDurationSec: c.kind === 'video' ? c.durationSec : 3,
            subtitle: c.subtitle,
          };
        })
        .filter((x) => Boolean(x.srcUrl));

      const { blob, mimeType } = await stitchStoryboardSequence(
        inputs,
        1280,
        720,
        (pct, msg) => {
          setStitchPct(pct);
          setStitchStatus(msg);
        },
        { lut, transition, ambientAudio, burnSubtitles: true }
      );

      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_master.${ext}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      onExportComplete(
        `Exported graded master (${clips.length} clips, ${formatTimecode(totalSeconds)})`
      );
    } catch (err) {
      onExportComplete(
        `Stitch export error: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setStitching(false);
    }
  };

  const handleExportSrt = () => {
    const inputs = clips.map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      srcUrl: '',
      stillDurationSec: c.kind === 'video' ? c.durationSec : 3,
      subtitle: c.subtitle || c.rawPrompt.slice(0, 90),
    }));
    const srt = buildSrtSubtitles(inputs);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_subtitles.srt`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    onExportComplete('Exported .SRT subtitle track!');
  };

  return (
    <>
      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 mb-2">
        <div className="flow-modal p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <Film className="w-4 h-4 stroke-[1.6] text-white" />
              <span className="font-medium text-white">Storyboard Cut</span>
              <span className="px-2.5 py-0.5 rounded-[32px] bg-white/8 border border-white/15 text-[11px] font-mono text-white/75">
                {clips.length} {clips.length === 1 ? 'clip' : 'clips'} · {formatTimecode(totalSeconds)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="extend-storyboard-btn"
                onClick={() => onExtendFinalClip(lastClip)}
                title={`Grab last frame of ${lastClip.label} to direct the next continuous scene`}
                className="flow-btn-glass flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[1.6]" />
                <span>Extend Scene</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreviewIndex(0);
                  setPreviewOpen(true);
                }}
                className="flow-btn-glass flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 stroke-[1.6]" />
                Play Sequence
              </button>

              <button
                type="button"
                data-testid="export-srt-btn"
                onClick={handleExportSrt}
                title="Download .SRT subtitle file"
                className="flow-btn-glass flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium cursor-pointer"
              >
                <Subtitles className="w-3.5 h-3.5 stroke-[1.6]" />
                <span>.SRT</span>
              </button>

              <button
                type="button"
                disabled={stitching}
                onClick={() => void handleExportStitched()}
                className="flow-cta-primary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] disabled:opacity-50 cursor-pointer"
              >
                {stitching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 stroke-[1.8] animate-spin" />
                    <span>{stitchPct}%</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 stroke-[1.8]" />
                    <span>Export Master</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Post-Production Cinema LUT, Transition & Ambient Audio Strip */}
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <label className="flow-select-pill inline-flex items-center gap-1.5 px-3 py-1">
              <Palette className="w-3.5 h-3.5 stroke-[1.5] text-white/70" />
              <select
                aria-label="Cinema LUT"
                data-testid="storyboard-lut-select"
                value={lut}
                onChange={(e) => setLut(e.target.value as CinemaLut)}
                className="bg-transparent outline-none cursor-pointer text-white/90"
              >
                <option value="natural">LUT: Natural</option>
                <option value="teal-orange">LUT: Teal &amp; Orange</option>
                <option value="warm-35mm">LUT: 35mm Warm</option>
                <option value="noir-bw">LUT: Noir B&amp;W</option>
                <option value="cyberpunk">LUT: Cyberpunk</option>
              </select>
            </label>

            <select
              aria-label="Transition"
              value={transition}
              onChange={(e) => setTransition(e.target.value as TransitionStyle)}
              className="flow-select-pill px-3 py-1 outline-none cursor-pointer"
            >
              <option value="crossfade">Transition: Crossfade</option>
              <option value="fade-black">Transition: Fade Black</option>
              <option value="cut">Transition: Hard Cut</option>
            </select>

            <label className="flow-select-pill inline-flex items-center gap-1.5 px-3 py-1">
              <Music className="w-3.5 h-3.5 stroke-[1.5] text-white/70" />
              <select
                aria-label="Ambient Soundscape"
                data-testid="storyboard-audio-select"
                value={ambientAudio}
                onChange={(e) => setAmbientAudio(e.target.value as AmbientAudioPreset)}
                className="bg-transparent outline-none cursor-pointer text-white/90"
              >
                <option value="none">Audio: Silent / Native</option>
                <option value="tropical-rain">Audio: Tropical Rain ($0)</option>
                <option value="neon-drone">Audio: Neon Night Drone ($0)</option>
                <option value="warm-cinema">Audio: Warm Cinema Pad ($0)</option>
              </select>
            </label>
          </div>

          {stitching && (
            <div className="text-[12px] text-[#29c58f] flex items-center justify-between">
              <span>{stitchStatus}</span>
              <span className="font-mono">{stitchPct}%</span>
            </div>
          )}

          {/* Drag-and-Drop Reorderable Scenebuilder Strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {clips.map((clip, idx) => {
              const thumb =
                clip.thumbnailDataUrl || (clip.blobKey ? blobUrls[clip.blobKey] : undefined);
              return (
                <div
                  key={clip.id}
                  draggable
                  onDragStart={() => setDragId(clip.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId && dragId !== clip.id) {
                      onReorderClips(dragId, clip.id);
                    }
                    setDragId(null);
                  }}
                  onDragEnd={() => setDragId(null)}
                  className={`shrink-0 w-32 rounded-[12px] border bg-white/5 overflow-hidden cursor-grab active:cursor-grabbing transition ${
                    dragId === clip.id
                      ? 'border-white opacity-60 scale-95'
                      : 'border-white/15 hover:border-white/30'
                  }`}
                >
                  <div className="relative h-16 bg-black">
                    {thumb ? (
                      clip.kind === 'video' && !clip.thumbnailDataUrl ? (
                        <video
                          src={thumb}
                          muted
                          style={{ filter: LUT_CSS_FILTERS[lut] }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={thumb}
                          alt={clip.label}
                          style={{ filter: LUT_CSS_FILTERS[lut] }}
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : null}
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-[32px] bg-black/65 border border-white/15 text-[10px] font-mono text-white">
                      {idx + 1}. {clip.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveClip(clip.id)}
                      title="Remove from Storyboard"
                      aria-label={`Remove ${clip.label}`}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-black/65 text-white/75 hover:text-[#fe6e6e] cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5 stroke-[1.8]" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-1.5 py-1 bg-black/55">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onMoveClip(clip.id, -1)}
                      className="p-0.5 text-white/60 hover:text-white disabled:opacity-25 cursor-pointer"
                      title="Move earlier"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 stroke-[1.6]" />
                    </button>
                    <span className="text-[10px] text-white/55 font-mono">
                      {clip.kind === 'video' ? `${clip.durationSec}s` : '3s still'}
                    </span>
                    <button
                      type="button"
                      disabled={idx === clips.length - 1}
                      onClick={() => onMoveClip(clip.id, 1)}
                      className="p-0.5 text-white/60 hover:text-white disabled:opacity-25 cursor-pointer"
                      title="Move later"
                    >
                      <ChevronRight className="w-3.5 h-3.5 stroke-[1.6]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Continuous Multi-Scene Theater Player Modal */}
      {previewOpen && activeClip && activeUrl && (
        <div
          className="fixed inset-0 z-[1050] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            data-testid="flow-modal-surface"
            className="flow-modal w-full max-w-4xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-white/15 flex items-center justify-between">
              <div className="text-[13px] font-medium text-white">
                Continuous Sequence Preview — Clip {previewIndex + 1}/{clips.length} (
                <span className="font-mono text-white/75">{activeClip.label}</span>)
              </div>
              <button
                type="button"
                aria-label="Close preview"
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[1.6]" />
              </button>
            </div>
            <div className="bg-black aspect-video flex items-center justify-center relative">
              {activeClip.kind === 'video' ? (
                <video
                  key={activeClip.id}
                  src={activeUrl}
                  autoPlay
                  controls
                  style={{ filter: LUT_CSS_FILTERS[lut] }}
                  onEnded={() =>
                    setPreviewIndex((idx) => (idx + 1 < clips.length ? idx + 1 : 0))
                  }
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  key={activeClip.id}
                  src={activeUrl}
                  alt={activeClip.label}
                  style={{ filter: LUT_CSS_FILTERS[lut] }}
                  className="w-full h-full object-contain"
                />
              )}
              {activeClip.subtitle && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-[12px] bg-black/80 border border-white/15 text-[14px] font-medium text-white max-w-[85%] text-center">
                  {activeClip.subtitle}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-white/15 flex items-center justify-between text-[13px] text-white/65">
              <span className="truncate max-w-xl">{activeClip.rawPrompt}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewIndex((idx) => (idx - 1 + clips.length) % clips.length)
                  }
                  className="flow-btn-glass px-3 py-1 text-[12px] cursor-pointer"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewIndex((idx) => (idx + 1) % clips.length)}
                  className="flow-btn-glass px-3 py-1 text-[12px] cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
