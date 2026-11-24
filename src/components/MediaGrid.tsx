import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
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
    title: 'Keyframe Still',
    tag: 'FLUX · @MIRA + @LOC-D · $0',
    mode: 't2i',
    prompt:
      'Medium close-up of @MIRA sketching by a rain-streaked window inside @LOC-D, warm tungsten lamp, 35mm cinema still',
  },
  {
    title: 'Cinematic Video + Audio',
    tag: 'Text to Video · Synced SFX',
    mode: 't2v',
    prompt:
      'Slow cinematic dolly-in on @MIRA looking out the rain-streaked window inside @LOC-D, soft distant thunder and rain patter, 35mm film',
  },
  {
    title: 'Anamorphic Establishing Shot',
    tag: '21:9 Cinema Frame · $0',
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
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-10 sm:py-16 text-center max-w-[1200px] mx-auto w-full">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[32px] bg-white/5 border border-white/15 text-[12px] font-medium text-white/75 mb-6 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-[#29c58f] shrink-0" />
          <span>
            $0 Forever Open-Weight Cinema
            <span className="hidden sm:inline"> · Character Bible · Storyboard Cut</span>
          </span>
        </div>

        <h1 className="text-[38px] sm:text-[56px] lg:text-[72px] font-medium tracking-[-0.04em] leading-[1.02] text-white max-w-4xl">
          Create cinema without limits
        </h1>

        <p className="text-[16px] leading-[24px] text-white/75 max-w-2xl mt-5">
          Direct keyframes, video continuity, and synced sound in one studio—powered by locked{' '}
          <span className="font-mono text-white">@TAG</span> character memory, first-to-last frame
          morphing, offline vault storage, and zero-cost open-weight engines.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 w-full">
          {STARTER_CARDS.map((card, idx) => (
            <button
              key={idx}
              type="button"
              data-testid={idx === 0 ? 'flow-card-surface' : undefined}
              onClick={() => onQuickPrompt(card.prompt, card.mode)}
              className="flow-card text-left p-5 flex flex-col justify-between gap-4 group cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[15px] font-medium text-white tracking-[-0.01em]">
                    {card.title}
                  </span>
                  <ArrowUpRight className="w-4 h-4 stroke-[1.5] text-white/50 group-hover:text-white transition shrink-0" />
                </div>
                <div className="text-[12px] text-white/50 font-mono mb-3">{card.tag}</div>
                <p className="text-[13px] leading-[20px] text-white/75 group-hover:text-white line-clamp-3 transition">
                  {card.prompt}
                </p>
              </div>
              <div className="text-[12px] font-medium text-white/50 group-hover:text-white transition">
                Load into composer
              </div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-[1536px] w-full mx-auto px-6 md:px-8 pt-4 pb-8 space-y-6">
      {/* Flow Contact-Sheet Pill Filter & Search Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flow-pill-group inline-flex items-center gap-1 p-1.5">
          {(
            [
              { id: 'all', label: 'All', count: counts.all },
              { id: 'video', label: 'Videos', count: counts.video },
              { id: 'image', label: 'Stills', count: counts.image },
              { id: 'cut', label: 'In Cut', count: counts.cut },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`filter-tab-${tab.id}`}
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-[32px] text-[13px] font-medium transition flex items-center gap-1.5 cursor-pointer ${
                  active
                    ? 'bg-white text-[#121317]'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[11px] ${active ? 'text-[#121317]/70' : 'text-white/50'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          {counts.failed > 0 && (
            <button
              type="button"
              onClick={onRetryAllFailed}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[32px] text-[12px] font-medium bg-[#b22f25]/25 border border-[#fe6e6e]/40 text-[#fe6e6e] hover:bg-[#b22f25]/35 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 stroke-[1.6]" />
              Retry Failed ({counts.failed})
            </button>
          )}

          <div className="relative flex-1 min-w-[180px] sm:w-60 sm:flex-initial">
            <Search className="w-4 h-4 stroke-[1.5] text-white/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shots or @TAG..."
              className="w-full pl-9 pr-8 py-2 text-[13px] rounded-[32px] bg-white/5 border border-white/15 text-white placeholder:text-white/50 focus:border-white/35 outline-none transition"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5 stroke-[1.6]" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            title={compact ? 'Switch to Cozy Grid' : 'Switch to Compact Grid'}
            aria-label={compact ? 'Switch to Cozy Grid' : 'Switch to Compact Grid'}
            className="flow-btn-glass hidden sm:flex w-9 h-9 items-center justify-center cursor-pointer"
          >
            {compact ? (
              <Grid2x2 className="w-4 h-4 stroke-[1.5]" />
            ) : (
              <Grid3x3 className="w-4 h-4 stroke-[1.5]" />
            )}
          </button>
        </div>
      </div>

      {visibleShots.length === 0 ? (
        <div className="py-16 text-center text-[14px] text-white/50">
          No shots match this filter.{' '}
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setQuery('');
            }}
            className="text-white underline underline-offset-4 ml-1 cursor-pointer"
          >
            Reset filter
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-6 ${
            compact
              ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }`}
        >
          {visibleShots.map((shot, idx) => {
            const mediaUrl = (shot.blobKey && blobUrls[shot.blobKey]) || shot.thumbnailDataUrl;
            const inStoryboard = shot.storyboardOrder !== null;
            const isUnmuted = Boolean(unmutedIds[shot.id]);

            return (
              <article
                key={shot.id}
                data-testid={idx === 0 ? 'flow-card-surface' : `shot-card-${shot.label}`}
                data-shot-label={shot.label}
                className="flow-card group overflow-hidden flex flex-col"
              >
                {/* Visual Stage */}
                <div
                  className="relative aspect-video bg-black overflow-hidden cursor-pointer"
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
                        <div className="pointer-events-none absolute inset-0 flow-tile-scrim" />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUnmutedIds((prev) => ({ ...prev, [shot.id]: !prev[shot.id] }));
                          }}
                          title={isUnmuted ? 'Mute preview audio' : 'Unmute video audio'}
                          className="flow-btn-glass absolute bottom-2.5 right-2.5 w-8 h-8 flex items-center justify-center cursor-pointer"
                        >
                          {isUnmuted ? (
                            <Volume2 className="w-3.5 h-3.5 stroke-[1.6] text-white" />
                          ) : (
                            <VolumeX className="w-3.5 h-3.5 stroke-[1.6] text-white/70" />
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <img
                          src={mediaUrl}
                          alt={shot.rawPrompt}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-300"
                        />
                        <div className="pointer-events-none absolute inset-0 flow-tile-scrim opacity-75" />
                      </>
                    )
                  ) : shot.status === 'failed' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#b22f25]/15">
                      <AlertCircle className="w-6 h-6 stroke-[1.5] text-[#fe6e6e] mb-2" />
                      <p className="text-[13px] font-medium text-white">Render Failed</p>
                      <p className="text-[12px] text-[#fe6e6e] mt-1 line-clamp-2">{shot.error}</p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetryShot(shot);
                        }}
                        className="flow-btn-glass mt-3 flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3 stroke-[1.6]" />
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[#131314]">
                      <Loader2 className="w-6 h-6 stroke-[1.5] text-white animate-spin mb-2.5" />
                      <p className="text-[13px] font-medium text-white">
                        {shot.status === 'queued' ? 'Queued in Batch...' : shot.phase}
                      </p>
                      <div className="w-3/4 h-1 rounded-full bg-white/15 mt-3 overflow-hidden">
                        <div
                          className="h-full bg-white transition-all duration-300"
                          style={{ width: `${Math.max(8, shot.progress)}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelShot(shot);
                        }}
                        className="mt-3 px-3 py-1 rounded-[32px] text-[11px] text-white/60 hover:text-[#fe6e6e] border border-white/15 hover:border-[#fe6e6e]/40 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Top Frosted Glass Badges */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-0.5 text-[11px] font-medium font-mono rounded-[32px] bg-black/45 text-white border border-white/20 backdrop-blur-sm">
                        {shot.label}
                      </span>
                      <span className="px-2.5 py-0.5 text-[10px] font-medium rounded-[32px] bg-black/45 text-white/85 border border-white/15 backdrop-blur-sm uppercase">
                        {shot.kind === 'video' ? `${shot.mode} · ${shot.durationSec}s` : 'STILL'}
                      </span>
                    </div>
                    {shot.status === 'completed' && (
                      <span className="w-7 h-7 rounded-full bg-black/45 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition">
                        <Maximize2 className="w-3 h-3 stroke-[1.6]" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata + Monochrome Action Bar */}
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-[13px] text-white/90 line-clamp-2 leading-[20px]">
                      {shot.rawPrompt}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] text-white/50">
                      <span className="truncate max-w-[165px]" title={shot.model}>
                        {shot.model}
                      </span>
                      <span>·</span>
                      <span className="font-mono">seed {shot.seed}</span>
                      {shot.appliedTags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded-[32px] bg-white/10 text-white/85 font-mono text-[10px]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-2.5 border-t border-white/15">
                    <div className="flex items-center gap-1.5">
                      {shot.status === 'completed' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onToggleStoryboard(shot)}
                            data-active={inStoryboard ? 'true' : 'false'}
                            title={
                              inStoryboard
                                ? 'In Scenebuilder Cut (click to remove)'
                                : 'Add to Scenebuilder Timeline'
                            }
                            className="flow-btn-glass flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                          >
                            {inStoryboard ? (
                              <Check className="w-3 h-3 stroke-[1.8]" />
                            ) : (
                              <ListPlus className="w-3 h-3 stroke-[1.6]" />
                            )}
                            <span>{inStoryboard ? 'In Cut' : 'Cut'}</span>
                          </button>

                          {shot.kind === 'image' ? (
                            <button
                              type="button"
                              onClick={() => onAnimateStill(shot)}
                              title="Animate this keyframe into a video shot (I2V)"
                              className="flow-btn-glass flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                            >
                              <Clapperboard className="w-3 h-3 stroke-[1.6]" />
                              <span>Animate</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onGrabLastFrame(shot)}
                              title="Extract exact last frame as Start Frame for next scene"
                              className="flow-btn-glass flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                            >
                              <Scissors className="w-3 h-3 stroke-[1.6]" />
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
                        aria-label="Remix shot"
                        className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      >
                        <Film className="w-3.5 h-3.5 stroke-[1.6]" />
                      </button>
                      {shot.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => onDownloadShot(shot)}
                          title="Download media file"
                          aria-label="Download shot"
                          className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 stroke-[1.6]" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteShot(shot)}
                        title="Delete shot"
                        aria-label="Delete shot"
                        className="p-1.5 rounded-full text-white/45 hover:text-[#fe6e6e] hover:bg-white/10 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 stroke-[1.6]" />
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
