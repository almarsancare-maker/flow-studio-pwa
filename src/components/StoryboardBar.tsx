import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Loader2,
  Play,
  Plus,
  X,
} from 'lucide-react';
import type { MediaShot } from '../types/studio';
import { stitchStoryboardSequence } from '../utils/sequenceStitcher';

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
    setStitchStatus('Preparing browser canvas recorder...');
    try {
      const inputs = clips
        .map((c) => {
          const srcUrl = (c.blobKey && blobUrls[c.blobKey]) || c.thumbnailDataUrl || '';
          return {
            id: c.id,
            label: c.label,
            kind: c.kind,
            srcUrl,
            stillDurationSec: 3,
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
        }
      );

      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_sequence.${ext}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      onExportComplete(`Exported stitched sequence (${clips.length} clips, ${formatTimecode(totalSeconds)})`);
    } catch (err) {
      onExportComplete(
        `Stitch export error: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setStitching(false);
    }
  };

  return (
    <>
      <div className="max-w-4xl w-full mx-auto px-3 sm:px-5 mb-1.5">
        <div className="rounded-2xl border border-zinc-800/90 flow-glass px-3.5 py-2.5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs">
              <Film className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-zinc-100">Storyboard Cut</span>
              <span className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                {clips.length} {clips.length === 1 ? 'clip' : 'clips'} · {formatTimecode(totalSeconds)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Google Flow Signature Scenebuilder Action: Extend Cut -> */}
              <button
                type="button"
                data-testid="extend-storyboard-btn"
                onClick={() => onExtendFinalClip(lastClip)}
                title={`Grab last frame of ${lastClip.label} to direct the next continuous scene`}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 border border-amber-500/35 text-amber-200 hover:bg-amber-500/25 transition"
              >
                <Plus className="w-3 h-3" />
                <span>Extend Scene</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPreviewIndex(0);
                  setPreviewOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                Play Sequence
              </button>
              <button
                type="button"
                disabled={stitching}
                onClick={() => void handleExportStitched()}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-400 text-zinc-950 hover:bg-emerald-300 disabled:opacity-60"
              >
                {stitching ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>{stitchPct}%</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3" />
                    <span>Export Stitched Video</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {stitching && (
            <div className="mb-2 text-[11px] text-emerald-300 flex items-center justify-between">
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
                  className={`shrink-0 w-32 rounded-xl border bg-zinc-900/85 overflow-hidden cursor-grab active:cursor-grabbing transition ${
                    dragId === clip.id
                      ? 'border-amber-400 opacity-60 scale-95'
                      : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="relative h-16 bg-zinc-950">
                    {thumb ? (
                      clip.kind === 'video' && !clip.thumbnailDataUrl ? (
                        <video src={thumb} muted className="w-full h-full object-cover" />
                      ) : (
                        <img src={thumb} alt={clip.label} className="w-full h-full object-cover" />
                      )
                    ) : null}
                    <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded-full bg-black/75 text-[10px] font-mono text-amber-300">
                      {idx + 1}. {clip.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveClip(clip.id)}
                      title="Remove from Storyboard"
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-zinc-300 hover:text-rose-400"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between px-1.5 py-1 bg-zinc-950/90">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onMoveClip(clip.id, -1)}
                      className="p-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-25"
                      title="Move earlier"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-zinc-500">
                      {clip.kind === 'video' ? `${clip.durationSec}s` : '3s still'}
                    </span>
                    <button
                      type="button"
                      disabled={idx === clips.length - 1}
                      onClick={() => onMoveClip(clip.id, 1)}
                      className="p-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-25"
                      title="Move later"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
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
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-200">
                Continuous Sequence Preview — Clip {previewIndex + 1}/{clips.length} (
                <span className="text-amber-300 font-mono">{activeClip.label}</span>)
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-black aspect-video flex items-center justify-center">
              {activeClip.kind === 'video' ? (
                <video
                  key={activeClip.id}
                  src={activeUrl}
                  autoPlay
                  controls
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
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="px-4 py-2.5 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
              <span className="truncate max-w-xl">{activeClip.rawPrompt}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewIndex((idx) => (idx - 1 + clips.length) % clips.length)
                  }
                  className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 hover:text-zinc-100"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewIndex((idx) => (idx + 1) % clips.length)}
                  className="px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 hover:text-zinc-100"
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
