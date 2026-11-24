import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clapperboard,
  Download,
  Film,
  Grid2x2,
  Grid3x3,
  ListPlus,
  Loader2,
  Maximize2,
  RefreshCw,
  Scissors,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { GenerationMode, MediaShot } from '../types/studio';

interface MediaGridProps {
  shots: MediaShot[];
  blobUrls: Record<string, string>;
  onOpenLightbox: (shot: MediaShot) => void;
  onToggleStoryboard: (shot: MediaShot) => void;
  onAnimateStill: (shot: MediaShot) => void;
  onGrabLastFrame: (shot: MediaShot) => void;
  onRemixShot: (shot: MediaShot) => void;
  onRetryShot: (shot: MediaShot) => void;
  onRetryAllFailed: () => void;
  onCancelShot: (shot: MediaShot) => void;
  onDownloadShot: (shot: MediaShot) => void;
  onDeleteShot: (shot: MediaShot) => void;
  onQuickPrompt: (prompt: string, mode?: GenerationMode) => void;
}

type FilterKind = 'all' | 'video' | 'image' | 'cut';

const STARTER_CARDS: { title: string; tag: string; mode: GenerationMode; prompt: string }[] = [
  {
    title: 'Keyframe Still ($0)',
    tag: 'Stage 1 · @MIRA + @LOC-D',
    mode: 't2i',
    prompt:
      'Medium close-up of @MIRA sketching by a rain-streaked window inside @LOC-D, warm tungsten lamp, 35mm cinema still',
  },
  {
    title: 'Seedance 2.5 Video + Audio',
    tag: 'T2V · Native SFX & Dialogue',
    mode: 't2v',
    prompt:
      'Slow cinematic dolly-in on @MIRA looking out the rain-streaked window inside @LOC-D, soft distant thunder and rain patter, 35mm film',
  },
  {
    title: 'Anamorphic Establishing Shot',
    tag: 'Stage 1 · 21:9 Cinema',
    mode: 't2i',
    prompt:
      'Wide establishing shot of neon-lit Manila alley after tropical rain, wet asphalt reflections, anamorphic lens flare, moody cinema',
  },
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
  onRetryAllFailed,
  onCancelShot,
  onDownloadShot,
  onDeleteShot,
  onQuickPrompt,
}: MediaGridProps) {
  const [filter, setFilter] = useState<FilterKind>('all');
  const [query, setQuery] = useState('');
  const [compact, setCompact] = useState(false);
  const [unmutedIds, setUnmutedIds] = useState<Record<string, boolean>>({});

  const counts = useMemo(
    () => ({
      all: shots.length,
      video: shots.filter((s) => s.kind === 'video').length,
      image: shots.filter((s) => s.kind === 'image').length,
      cut: shots.filter((s) => s.storyboardOrder !== null).length,
      failed: shots.filter((s) => s.status === 'failed').length,
    }),
    [shots]
  );

  const visibleShots = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shots.filter((s) => {
      if (filter === 'video' && s.kind !== 'video') return false;
      if (filter === 'image' && s.kind !== 'image') return false;
      if (filter === 'cut' && s.storyboardOrder === null) return false;
      if (q) {
        const hay = `${s.label} ${s.rawPrompt} ${s.model} ${s.appliedTags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [shots, filter, query]);

  if (shots.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 via-orange-500/10 to-violet-500/20 border border-white/10 flex items-center justify-center mb-4 shadow-2xl">
          <Sparkles className="w-7 h-7 text-amber-300" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">
          Cabardo Studio AI Generator{' '}
          <span className="text-emerald-400">FREE Lifetime</span>
        </h1>
        <p className="text-sm text-zinc-400 max-w-2xl mt-2.5 leading-relaxed">
          Google Flow–style cinema studio with every limitation fixed: locked{' '}
          <span className="text-amber-300 font-mono">@TAG</span> Character Bible, First-to-Last Frame
          continuity, Scenebuilder Video Stitcher, offline IndexedDB Vault, Bulk Script Import,{' '}
          <span className="text-emerald-300">$0 Free Cloud &amp; Colab T4</span>, plus{' '}
          <span className="text-violet-300">Official Seedance 2.5</span>.
        </p>

        <div className="grid sm:grid-cols-3 gap-3 mt-8 max-w-3xl w-full">
          {STARTER_CARDS.map((card, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onQuickPrompt(card.prompt, card.mode)}
              className="text-left p-4 rounded-2xl bg-zinc-900/65 border border-zinc-800/90 hover:border-amber-500/40 hover:bg-zinc-900/95 transition group"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition">
                  {card.title}
                </span>
                <span className="text-[10px] font-mono text-amber-400">→</span>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono mb-2">{card.tag}</div>
              <div className="text-xs text-zinc-400 group-hover:text-zinc-200 line-clamp-3 leading-relaxed">
                {card.prompt}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] w-full mx-auto px-3 sm:px-5 pt-4 pb-6 space-y-4">
      {/* Google Flow Contact Sheet Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-zinc-900/80 border border-zinc-800/90">
          {(
            [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'video', label: 'Videos', count: counts.video },
              { id: 'image', label: 'Stills', count: counts.image },
              { id: 'cut', label: 'In Cut', count: counts.cut },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`filter-tab-${tab.id}`}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${
                filter === tab.id
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] ${
                  filter === tab.id ? 'text-zinc-700' : 'text-zinc-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          {counts.failed > 0 && (
            <button
              type="button"
              onClick={onRetryAllFailed}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-rose-500/15 border border-rose-500/30 text-rose-200 hover:bg-rose-500/25"
            >
              <RefreshCw className="w-3 h-3" />
              Retry Failed ({counts.failed})
            </button>
          )}

          <div className="relative flex-1 sm:w-52 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shots or @TAG..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            title={compact ? 'Switch to Cozy Grid' : 'Switch to Compact Grid'}
            className="hidden sm:flex p-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
          >
            {compact ? <Grid2x2 className="w-3.5 h-3.5" /> : <Grid3x3 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {visibleShots.length === 0 ? (
        <div className="py-16 text-center text-xs text-zinc-500">
          No shots match this filter.{' '}
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setQuery('');
            }}
            className="text-amber-300 underline ml-1"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            compact
              ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }`}
        >
          {visibleShots.map((shot) => {
            const mediaUrl = (shot.blobKey && blobUrls[shot.blobKey]) || shot.thumbnailDataUrl;
            const inStoryboard = shot.storyboardOrder !== null;
            const isUnmuted = Boolean(unmutedIds[shot.id]);

            return (
              <article
                key={shot.id}
                data-testid={`shot-card-${shot.label}`}
                className="group rounded-2xl border border-zinc-800/80 bg-zinc-950/90 overflow-hidden flex flex-col hover:border-zinc-600/90 transition shadow-xl shadow-black/40"
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
                      <>
                        <video
                          src={mediaUrl}
                          poster={shot.thumbnailDataUrl}
                          muted={!isUnmuted}
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUnmutedIds((prev) => ({ ...prev, [shot.id]: !prev[shot.id] }));
                          }}
                          title={isUnmuted ? 'Mute preview audio' : 'Unmute Seedance / video audio'}
                          className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/75 text-zinc-200 border border-white/15 hover:bg-black transition"
                        >
                          {isUnmuted ? (
                            <Volume2 className="w-3.5 h-3.5 text-violet-300" />
                          ) : (
                            <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                        </button>
                      </>
                    ) : (
                      <img
                        src={mediaUrl}
                        alt={shot.rawPrompt}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300"
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
                        className="mt-2.5 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-500/20 text-rose-200 border border-rose-500/30 hover:bg-rose-500/30"
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
                          className="h-full bg-gradient-to-r from-amber-400 to-violet-400 transition-all duration-300"
                          style={{ width: `${Math.max(8, shot.progress)}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelShot(shot);
                        }}
                        className="mt-2.5 px-2.5 py-0.5 rounded-full text-[10px] text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/40"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Top Overlay Badges */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded-full bg-black/75 text-amber-300 border border-white/10">
                        {shot.label}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-black/70 text-zinc-200 border border-white/10 uppercase">
                        {shot.kind === 'video' ? `${shot.mode} · ${shot.durationSec}s` : 'STILL'}
                      </span>
                    </div>
                    {shot.status === 'completed' && (
                      <span className="p-1 rounded-full bg-black/70 text-zinc-300 opacity-0 group-hover:opacity-100 transition">
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
                      <span className="truncate max-w-[175px]" title={shot.model}>
                        {shot.model}
                      </span>
                      <span>·</span>
                      <span className="font-mono">seed {shot.seed}</span>
                      {shot.appliedTags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-300 font-mono"
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
                          <button
                            type="button"
                            onClick={() => onToggleStoryboard(shot)}
                            title={
                              inStoryboard
                                ? 'In Scenebuilder Cut (click to remove)'
                                : 'Add to Scenebuilder Timeline'
                            }
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                              inStoryboard
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                            }`}
                          >
                            {inStoryboard ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <ListPlus className="w-3 h-3" />
                            )}
                            <span>{inStoryboard ? 'In Cut' : 'Cut'}</span>
                          </button>

                          {shot.kind === 'image' ? (
                            <button
                              type="button"
                              onClick={() => onAnimateStill(shot)}
                              title="Animate this keyframe into a video shot (I2V)"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition"
                            >
                              <Clapperboard className="w-3 h-3" />
                              <span>Animate</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onGrabLastFrame(shot)}
                              title="Extract exact last frame as Start Frame for next scene"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition"
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
                        title="Remix prompt, seed & negative prompt in composer"
                        className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                      >
                        <Film className="w-3.5 h-3.5" />
                      </button>
                      {shot.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => onDownloadShot(shot)}
                          title="Download media file"
                          className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteShot(shot)}
                        title="Delete shot"
                        className="p-1.5 rounded-full text-zinc-500 hover:text-rose-400 hover:bg-zinc-900"
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
      )}
    </div>
  );
}
