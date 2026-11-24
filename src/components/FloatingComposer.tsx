import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Clapperboard,
  Dice5,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  SlidersHorizontal,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import type { AspectRatio, BibleEntry, GenerationMode } from '../types/studio';
import { compilePromptWithBible } from '../utils/promptCompiler';
import { fileToResizedDataUrl } from '../utils/frameGrabber';

export interface ComposerSubmitPayload {
  rawPrompt: string;
  negativePrompt: string;
  mode: GenerationMode;
  aspectRatio: AspectRatio;
  durationSec: number;
  steps: number;
  cfgScale: number;
  seed: number;
  startFrameDataUrl?: string;
}

export interface RemixRecipePayload {
  nonce: number;
  negativePrompt: string;
  seed: number;
  steps: number;
  cfgScale: number;
  durationSec: number;
}

interface FloatingComposerProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  mode: GenerationMode;
  onModeChange: (m: GenerationMode) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ar: AspectRatio) => void;
  startFrameDataUrl?: string;
  onStartFrameChange: (dataUrl?: string) => void;
  remixRecipe?: RemixRecipePayload | null;
  bibleEntries: BibleEntry[];
  queueCount: number;
  onSubmit: (payload: ComposerSubmitPayload) => void;
}

export function FloatingComposer({
  prompt,
  onPromptChange,
  mode,
  onModeChange,
  aspectRatio,
  onAspectRatioChange,
  startFrameDataUrl,
  onStartFrameChange,
  remixRecipe,
  bibleEntries,
  queueCount,
  onSubmit,
}: FloatingComposerProps) {
  const [durationSec, setDurationSec] = useState(4);
  const [negativePrompt, setNegativePrompt] = useState(
    'blurry, deformed hands, extra limbs, watermark, text, low quality, flickering'
  );
  const [seedLocked, setSeedLocked] = useState(false);
  const [seedValue, setSeedValue] = useState(() => Math.floor(Math.random() * 999999) + 1000);
  const [steps, setSteps] = useState(24);
  const [cfgScale, setCfgScale] = useState(6.5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExpandedPreview, setShowExpandedPreview] = useState(false);

  useEffect(() => {
    if (!remixRecipe) return;
    setNegativePrompt(remixRecipe.negativePrompt);
    setSeedValue(remixRecipe.seed);
    setSeedLocked(true);
    setSteps(remixRecipe.steps);
    setCfgScale(remixRecipe.cfgScale);
    setDurationSec(remixRecipe.durationSec);
  }, [remixRecipe]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const compiled = useMemo(
    () => compilePromptWithBible(prompt, bibleEntries),
    [prompt, bibleEntries]
  );

  const handlePickStartFrame = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await fileToResizedDataUrl(file, 1024);
    onStartFrameChange(dataUrl);
    onModeChange('i2v');
  };

  const handleQueue = () => {
    if (!prompt.trim()) return;
    const effectiveSeed = seedLocked
      ? seedValue
      : compiled.suggestedSeed ?? Math.floor(Math.random() * 2_000_000_000);
    if (!seedLocked) setSeedValue(effectiveSeed);

    onSubmit({
      rawPrompt: prompt.trim(),
      negativePrompt: negativePrompt.trim(),
      mode,
      aspectRatio,
      durationSec,
      steps,
      cfgScale,
      seed: effectiveSeed,
      startFrameDataUrl:
        mode === 'i2v' ? startFrameDataUrl ?? compiled.suggestedRefImage : undefined,
    });
  };

  const appendTag = (tag: string) => {
    const spacer = prompt.trim().length > 0 && !prompt.endsWith(' ') ? ' ' : '';
    onPromptChange(`${prompt}${spacer}${tag} `);
  };

  return (
    <div className="sticky bottom-0 z-30 pb-3 pt-2 px-3 sm:px-5 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        {/* Advanced Recipe Popover (Fix #4: Transparent Seeds, Negative Prompts, Steps, CFG) */}
        {showAdvanced && (
          <div className="mb-2 rounded-2xl border border-zinc-800 flow-glass p-3.5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">
                Shot Recipe Controls (Fix #4: No Black-Box Prompts)
              </span>
              <button
                type="button"
                onClick={() => setShowAdvanced(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Negative Prompt</label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Seed</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={seedValue}
                      onChange={(e) => {
                        setSeedValue(Number(e.target.value) || 0);
                        setSeedLocked(true);
                      }}
                      className="w-full px-2 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSeedLocked((v) => !v)}
                      title={seedLocked ? 'Seed Locked' : 'Random Seed'}
                      className={`p-1.5 rounded-lg border ${
                        seedLocked
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      {seedLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeedValue(Math.floor(Math.random() * 2_000_000_000))}
                      title="Roll new seed"
                      className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    >
                      <Dice5 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Steps ({steps})</label>
                  <input
                    type="range"
                    min={4}
                    max={40}
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-full accent-amber-400 mt-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">CFG ({cfgScale})</label>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={0.5}
                    value={cfgScale}
                    onChange={(e) => setCfgScale(Number(e.target.value))}
                    className="w-full accent-amber-400 mt-2"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Glassmorphic Google Flow Composer Dock */}
        <div className="rounded-2xl border border-zinc-800/90 flow-glass shadow-2xl shadow-black/60 p-3 space-y-2.5">
          {/* Top Row: Mode Switcher + Start Frame Slot + Quick @TAG Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl bg-zinc-950/90 p-0.5 border border-zinc-800/90">
              {(
                [
                  { id: 't2i', label: 'Keyframe Still', icon: ImageIcon },
                  { id: 't2v', label: 'Text to Video', icon: Clapperboard },
                  { id: 'i2v', label: 'Frames to Video', icon: Film },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`mode-tab-${tab.id}`}
                    onClick={() => onModeChange(tab.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      active
                        ? 'bg-zinc-800 text-amber-300 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick @TAG Bar */}
            {bibleEntries.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto max-w-full">
                {bibleEntries.slice(0, 6).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => appendTag(b.tag)}
                    title={`Insert ${b.tag}: ${b.descriptor}`}
                    className="px-2 py-0.5 text-[11px] font-mono rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:bg-amber-500/20 shrink-0 transition"
                  >
                    {b.tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Start Frame Chip (visible when mode === 'i2v' or a grabbed frame is loaded) */}
          {(mode === 'i2v' || startFrameDataUrl) && (
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handlePickStartFrame(e.target.files?.[0])}
              />
              {startFrameDataUrl ? (
                <>
                  <img
                    src={startFrameDataUrl}
                    alt="Start frame"
                    className="w-16 h-10 rounded-lg object-cover border border-amber-500/40"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-amber-300">
                      Start Frame Locked (Scene Continuity Active)
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      Next video shot will seamlessly continue from this exact frame.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartFrameChange(undefined)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-900"
                    title="Clear Start Frame"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs text-zinc-400 hover:text-amber-300 transition w-full py-1 px-1"
                >
                  <ImagePlus className="w-4 h-4 text-amber-400" />
                  <span>
                    Upload Start Frame — or click <strong className="text-zinc-200">Grab Last Frame</strong> on any clip above!
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Prompt Textarea */}
          <div className="relative">
            <textarea
              rows={2}
              data-testid="composer-prompt-input"
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleQueue();
                }
              }}
              placeholder={
                mode === 't2i'
                  ? 'Describe your cinematic keyframe... Use @MIRA or @LOC-D from your Bible (Ctrl+Enter to queue)'
                  : 'Describe camera motion and action... e.g. Slow dolly-in on @MIRA inside @LOC-D, rain streaking on glass'
              }
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none resize-none leading-relaxed pr-2"
            />
          </div>

          {/* Bible Expansion Indicator */}
          {compiled.appliedTags.length > 0 && (
            <div className="text-[11px] bg-amber-500/8 border border-amber-500/20 rounded-lg px-2.5 py-1.5 text-amber-200/90">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Bible Auto-Expanded: <strong>{compiled.appliedTags.join(', ')}</strong>
                  {compiled.suggestedSeed !== undefined && !seedLocked && (
                    <span className="text-zinc-400">· Seed locked {compiled.suggestedSeed}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowExpandedPreview((v) => !v)}
                  className="underline text-amber-300 hover:text-amber-200"
                >
                  {showExpandedPreview ? 'Hide' : 'Preview'}
                </button>
              </div>
              {showExpandedPreview && (
                <p className="mt-1.5 text-zinc-300 text-[11px] leading-relaxed border-t border-amber-500/15 pt-1.5">
                  {compiled.compiledPrompt}
                </p>
              )}
            </div>
          )}

          {/* Bottom Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/70">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Aspect Ratio */}
              <select
                aria-label="Aspect ratio"
                value={aspectRatio}
                onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
                className="px-2 py-1 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 outline-none"
              >
                <option value="16:9">16:9 Cinema</option>
                <option value="9:16">9:16 Reels</option>
                <option value="1:1">1:1 Square</option>
                <option value="21:9">21:9 Anamorphic</option>
              </select>

              {/* Duration (Video modes) */}
              {mode !== 't2i' && (
                <select
                  aria-label="Duration"
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="px-2 py-1 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value={3}>3s clip</option>
                  <option value={4}>4s clip</option>
                  <option value={5}>5s clip</option>
                  <option value={6}>6s clip</option>
                </select>
              )}

              {/* Recipe Popover Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition ${
                  showAdvanced || seedLocked
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Recipe</span>
                {seedLocked && <Lock className="w-2.5 h-2.5 text-amber-400" />}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {queueCount > 0 && (
                <span className="text-[11px] text-amber-300/90 animate-pulse">
                  {queueCount} rendering...
                </span>
              )}
              <button
                type="button"
                data-testid="composer-submit-btn"
                disabled={!prompt.trim()}
                onClick={handleQueue}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-400 to-orange-400 text-zinc-950 hover:from-amber-300 hover:to-orange-300 disabled:opacity-40 shadow-lg shadow-amber-500/20 transition cursor-pointer"
              >
                <span>{mode === 't2i' ? 'Generate Still' : 'Generate Video'}</span>
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
