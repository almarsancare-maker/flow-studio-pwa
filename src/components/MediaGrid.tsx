import {
  AlertCircle,
  Check,
  Clapperboard,
  Download,
  Film,
  ListPlus,
  Loader2,
  Maximize2,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { MediaShot } from '../types/studio';

interface MediaGridProps {
  shots: MediaShot[];
  blobUrls: Record<string, string>;
  onOpenLightbox: (shot: MediaShot) => void;
  onToggleStoryboard: (shot: MediaShot) => void;
  onAnimateStill: (shot: MediaShot) => void;
  onGrabLastFrame: (shot: MediaShot) => void;
  onRemixShot: (shot: MediaShot) => void;
  onRetryShot: (shot: MediaShot) => void;
  onDownloadShot: (shot: MediaShot) => void;
  onDeleteShot: (shot: MediaShot) => void;
  onQuickPrompt: (prompt: string) => void;
}

const STARTER_PROMPTS = [
  'Medium close-up of @MIRA sketching by a rain-streaked window inside @LOC-D, warm tungsten lamp, 35mm cinema still',
  'Wide establishing shot of neon-lit Manila alley after tropical rain, wet asphalt reflections, anamorphic lens flare',
  'Slow cinematic push-in on @MIRA turning toward camera with subtle smile inside @LOC-D, shallow depth of field',
];

export function MediaGrid({
  shots,
  blobUrls,
  onOpenLightbox,
  onToggleStoryboard,
  onAnimateStill,
  onGrabLastFrame,
  onRemixShot,
  onRetryShot,
  onDownloadShot,
  onDeleteShot,
  onQuickPrompt,
}: MediaGridProps) {
  if (shots.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-14 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
          <Sparkles className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-100">
          Direct your next film at $0 cost
        </h1>
        <p className="text-sm text-zinc-400 max-w-xl mt-2 leading-relaxed">
          Built like Google Flow — with all 7 limitations fixed: locked <span className="text-amber-300">@TAG</span> Character Bible,
          1-click Last-Frame continuity, browser Storyboard Stitcher, permanent offline IndexedDB Vault, Bulk Script Import, and free Colab T4 GPU acceleration.
        </p>

        <div className="grid sm:grid-cols-3 gap-2.5 mt-7 max-w-3xl w-full">
          {STARTER_PROMPTS.map((sample, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onQuickPrompt(sample)}
              className="text-left p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-amber-500/40 hover:bg-zinc-900 transition group"
            >
              <div className="text-[11px] font-mono text-amber-400 mb-1">Try Shot 0{idx + 1} →</div>
              <div className="text-xs text-zinc-300 group-hover:text-zinc-100 line-clamp-3 leading-relaxed">
                {sample}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-5 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {shots.map((shot) => {
        const mediaUrl = (shot.blobKey && blobUrls[shot.blobKey]) || shot.thumbnailDataUrl;
        const inStoryboard = shot.storyboardOrder !== null;

        return (
          <article
            key={shot.id}
            data-testid={`shot-card-${shot.label}`}
            className="group rounded-2xl border border-zinc-800/90 bg-zinc-950/90 overflow-hidden flex flex-col hover:border-zinc-700 transition shadow-lg shadow-black/30"
          >
            {/* Visual Stage */}
            <div
              className="relative aspect-video bg-zinc-900 overflow-hidden cursor-pointer"
              onClick={() => {
                if (shot.status === 'completed') onOpenLightbox(shot);
              }}
            >
              {shot.status === 'completed' && mediaUrl ? (
                shot.kind === 'video' ? (
                  <video
                    src={mediaUrl}
                    poster={shot.thumbnailDataUrl}
                    muted
                    loop
                    playsInline
                    onMouseEnter={(e) => {
                      void e.currentTarget.play().catch(() => {});
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt={shot.rawPrompt}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                  />
                )
              ) : shot.status === 'failed' ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-rose-950/20">
                  <AlertCircle className="w-6 h-6 text-rose-400 mb-1.5" />
                  <p className="text-xs font-medium text-rose-200">Render Failed</p>
                  <p className="text-[11px] text-rose-300/80 mt-1 line-clamp-2">{shot.error}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetryShot(shot);
                    }}
                    className="mt-2.5 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-rose-500/20 text-rose-200 border border-rose-500/30 hover:bg-rose-500/30"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900">
                  <Loader2 className="w-6 h-6 text-amber-400 animate-spin mb-2" />
                  <p className="text-xs font-medium text-zinc-200">
                    {shot.status === 'queued' ? 'Queued in Batch...' : shot.phase}
                  </p>
                  <div className="w-3/4 h-1.5 rounded-full bg-zinc-800 mt-2.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all duration-300"
                      style={{ width: `${Math.max(8, shot.progress)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Top Overlay Badges */}
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1">
                  <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded-md bg-black/75 text-amber-300 border border-white/10">
                    {shot.label}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded-md bg-black/70 text-zinc-200 border border-white/10 uppercase">
                    {shot.kind === 'video' ? `${shot.mode} · ${shot.durationSec}s` : 'STILL'}
                  </span>
                </div>
                {shot.status === 'completed' && (
                  <span className="p-1 rounded-md bg-black/70 text-zinc-300 opacity-0 group-hover:opacity-100 transition">
                    <Maximize2 className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>

            {/* Metadata + Action Bar */}
            <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
              <div>
                <p className="text-xs text-zinc-200 line-clamp-2 leading-relaxed">
                  {shot.rawPrompt}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-zinc-500">
                  <span className="truncate max-w-[160px]" title={shot.model}>
                    {shot.model}
                  </span>
                  <span>·</span>
                  <span className="font-mono">seed {shot.seed}</span>
                  {shot.appliedTags.map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 font-mono"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-1 pt-2 border-t border-zinc-800/80">
                <div className="flex items-center gap-1">
                  {shot.status === 'completed' && (
                    <>
                      {/* Fix #3: Add to Storyboard */}
                      <button
                        type="button"
                        onClick={() => onToggleStoryboard(shot)}
                        title={inStoryboard ? 'In Storyboard (click to remove)' : 'Add to Storyboard Timeline'}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition ${
                          inStoryboard
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {inStoryboard ? <Check className="w-3 h-3" /> : <ListPlus className="w-3 h-3" />}
                        <span>{inStoryboard ? 'In Cut' : 'Cut'}</span>
                      </button>

                      {/* Fix #2: 1-Click Continuity */}
                      {shot.kind === 'image' ? (
                        <button
                          type="button"
                          onClick={() => onAnimateStill(shot)}
                          title="Use this keyframe as Start Frame for Frames-to-Video (I2V)"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition"
                        >
                          <Clapperboard className="w-3 h-3" />
                          <span>Animate</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onGrabLastFrame(shot)}
                          title="Extract exact last frame as Start Frame for next scene"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition"
                        >
                          <Scissors className="w-3 h-3" />
                          <span>Last Frame</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onRemixShot(shot)}
                    title="Remix prompt & settings in composer"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  >
                    <Film className="w-3.5 h-3.5" />
                  </button>
                  {shot.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => onDownloadShot(shot)}
                      title="Download local media file"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteShot(shot)}
                    title="Delete shot"
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-900"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
