import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Camera,
  Clapperboard,
  Dice5,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  SlidersHorizontal,
  Sparkles,
  Unlock,
  Volume2,
  X,
} from 'lucide-react';
import type { AspectRatio, BibleEntry, EngineSettings, GenerationMode } from '../types/studio';
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
  endFrameDataUrl?: string;
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
  endFrameDataUrl?: string;
  onEndFrameChange: (dataUrl?: string) => void;
  remixRecipe?: RemixRecipePayload | null;
  engineSettings: EngineSettings;
  bibleEntries: BibleEntry[];
  queueCount: number;
  onSubmit: (payload: ComposerSubmitPayload) => void;
}

const CAMERA_PRESETS = [
  { label: 'Dolly In', snippet: 'smooth cinematic slow dolly-in' },
  { label: 'Pan Left', snippet: 'steady horizontal pan left' },
  { label: 'Orbit 360°', snippet: 'slow orbital camera sweep around subject' },
  { label: 'Handheld', snippet: 'intimate 35mm handheld cinema camera' },
  { label: 'Crane Up', snippet: 'sweeping crane shot rising upward' },
  { label: 'Rack Focus', snippet: 'shallow depth of field rack focus pull' },
  { label: 'Slow Mo', snippet: 'silky cinematic slow motion 60fps' },
];

export function FloatingComposer({
  prompt,
  onPromptChange,
  mode,
  onModeChange,
  aspectRatio,
  onAspectRatioChange,
  startFrameDataUrl,
  onStartFrameChange,
  endFrameDataUrl,
  onEndFrameChange,
  remixRecipe,
  engineSettings,
  bibleEntries,
  queueCount,
  onSubmit,
}: FloatingComposerProps) {
  const [durationSec, setDurationSec] = useState(5);
  const [negativePrompt, setNegativePrompt] = useState(
    'blurry, deformed hands, extra limbs, watermark, text, low quality, flickering'
  );
  const [seedLocked, setSeedLocked] = useState(false);
  const [seedValue, setSeedValue] = useState(() => Math.floor(Math.random() * 999999) + 1000);
  const [steps, setSteps] = useState(24);
  const [cfgScale, setCfgScale] = useState(6.5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCameraBar, setShowCameraBar] = useState(false);
  const [showExpandedPreview, setShowExpandedPreview] = useState(false);

  const startInputRef = useRef<HTMLInputElement | null>(null);
  const endInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!remixRecipe) return;
    setNegativePrompt(remixRecipe.negativePrompt);
    setSeedValue(remixRecipe.seed);
    setSeedLocked(true);
    setSteps(remixRecipe.steps);
    setCfgScale(remixRecipe.cfgScale);
    setDurationSec(remixRecipe.durationSec);
  }, [remixRecipe]);

  const compiled = useMemo(
    () => compilePromptWithBible(prompt, bibleEntries),
    [prompt, bibleEntries]
  );

  const handlePickFrame = async (file: File | undefined, slot: 'start' | 'end') => {
    if (!file) return;
    const dataUrl = await fileToResizedDataUrl(file, 1024);
    if (slot === 'start') onStartFrameChange(dataUrl);
    else onEndFrameChange(dataUrl);
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
      endFrameDataUrl: mode === 'i2v' ? endFrameDataUrl : undefined,
    });
  };

  const appendText = (chunk: string) => {
    const trimmed = prompt.trim();
    if (trimmed.toLowerCase().includes(chunk.toLowerCase())) return;
    const sep = trimmed.length === 0 ? '' : trimmed.endsWith(',') ? ' ' : ', ';
    onPromptChange(`${trimmed}${sep}${chunk}`);
  };

  const appendTag = (tag: string) => {
    const spacer = prompt.trim().length > 0 && !prompt.endsWith(' ') ? ' ' : '';
    onPromptChange(`${prompt}${spacer}${tag} `);
  };

  const isSeedanceVideo = mode !== 't2i' && engineSettings.activeEngine === 'seedance-byok';

  return (
    <div className="sticky bottom-0 z-30 pb-3 pt-2 px-3 sm:px-5 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        {/* Advanced Recipe Popover (Fix #4: Transparent Seeds, Negative Prompts, Steps, CFG) */}
        {showAdvanced && (
          <div className="mb-2 rounded-2xl border border-zinc-800/90 flow-glass p-3.5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">
                Shot Recipe Controls (Seed Lock, Negative Prompt, Steps &amp; CFG)
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

        {/* 1:1 Google Flow Floating Glassmorphic Composer Pill */}
        <div className="rounded-[26px] border border-zinc-800/90 focus-within:border-zinc-600/90 flow-pill p-3 sm:p-3.5 space-y-2.5 transition-colors">
          {/* Top Row: Flow Mode Tabs + Bible @TAG Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full bg-zinc-950/95 p-0.5 border border-zinc-800/90">
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
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                      active
                        ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-100'
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

          {/* Google Flow First Frame -> Last Frame Slots (visible in Frames-to-Video or when a frame is loaded) */}
          {(mode === 'i2v' || startFrameDataUrl || endFrameDataUrl) && (
            <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-2 p-2 rounded-2xl bg-zinc-950/85 border border-zinc-800/90">
              <input
                ref={startInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handlePickFrame(e.target.files?.[0], 'start')}
              />
              <input
                ref={endInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handlePickFrame(e.target.files?.[0], 'end')}
              />

              {/* Start Frame Slot */}
              {startFrameDataUrl ? (
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={startFrameDataUrl}
                    alt="Start frame"
                    className="w-14 h-9 rounded-lg object-cover border border-amber-500/50 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-amber-300 truncate">
                      Start Frame Locked (Scene Continuity Active)
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">Opening frame of shot</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartFrameChange(undefined)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-900"
                    title="Clear Start Frame"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs text-zinc-400 hover:text-amber-300 transition py-1 px-1.5 rounded-xl hover:bg-zinc-900/80"
                >
                  <ImagePlus className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">
                    <strong className="text-zinc-200">Start Frame</strong> — upload or Grab Last Frame
                  </span>
                </button>
              )}

              <ArrowRight className="w-3.5 h-3.5 text-zinc-600 hidden sm:block" />

              {/* End Frame Slot (Google Flow First -> Last Frame Interpolation for Seedance 2.5!) */}
              {endFrameDataUrl ? (
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src={endFrameDataUrl}
                    alt="End frame"
                    className="w-14 h-9 rounded-lg object-cover border border-violet-500/50 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-violet-300 truncate">
                      End Frame Locked
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">Target ending composition</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEndFrameChange(undefined)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-900"
                    title="Clear End Frame"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => endInputRef.current?.click()}
                  className="flex items-center gap-2 text-xs text-zinc-500 hover:text-violet-300 transition py-1 px-1.5 rounded-xl hover:bg-zinc-900/80"
                >
                  <ImagePlus className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span className="truncate">
                    <strong className="text-zinc-300">End Frame</strong> (optional morph target)
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Prompt Input */}
          <div className="relative px-1">
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
                  ? 'Describe your $0 keyframe still... Use @MIRA or @LOC-D from your Bible (Ctrl+Enter)'
                  : 'Direct camera motion, action & spoken "dialogue"... Use @MIRA or @LOC-D (Ctrl+Enter)'
              }
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none resize-none leading-relaxed pr-2"
            />
          </div>

          {/* 1-Click Camera Motion Presets Drawer (Flow Director Controls) */}
          {showCameraBar && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 px-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">
                Camera:
              </span>
              {CAMERA_PRESETS.map((cam) => (
                <button
                  key={cam.label}
                  type="button"
                  onClick={() => appendText(cam.snippet)}
                  className="px-2.5 py-0.5 rounded-full text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-500/40 hover:text-amber-200 shrink-0 transition"
                >
                  + {cam.label}
                </button>
              ))}
            </div>
          )}

          {/* Bible Expansion Indicator */}
          {compiled.appliedTags.length > 0 && (
            <div className="text-[11px] bg-amber-500/8 border border-amber-500/20 rounded-xl px-2.5 py-1.5 text-amber-200/90">
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
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-zinc-800/70">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Aspect Ratio */}
              <select
                aria-label="Aspect ratio"
                value={aspectRatio}
                onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
                className="px-2.5 py-1 text-xs rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200 outline-none hover:border-zinc-700 cursor-pointer"
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
                  className="px-2.5 py-1 text-xs rounded-full bg-zinc-900 border border-zinc-800 text-zinc-200 outline-none hover:border-zinc-700 cursor-pointer"
                >
                  <option value={3}>3s</option>
                  <option value={4}>4s</option>
                  <option value={5}>5s</option>
                  <option value={6}>6s</option>
                  <option value={8}>8s (Seedance)</option>
                  <option value={10}>10s (Seedance)</option>
                </select>
              )}

              {/* Camera Motion Presets Toggle */}
              <button
                type="button"
                data-testid="toggle-camera-presets-btn"
                onClick={() => setShowCameraBar((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition ${
                  showCameraBar
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <Camera className="w-3 h-3" />
                <span>Camera</span>
              </button>

              {/* Recipe Popover Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition ${
                  showAdvanced || seedLocked
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>Recipe</span>
                {seedLocked && <Lock className="w-2.5 h-2.5 text-amber-400" />}
              </button>

              {/* Seedance Native Audio Status Badge */}
              {isSeedanceVideo && engineSettings.seedanceAudio && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-200">
                  <Volume2 className="w-3 h-3 text-violet-400" />
                  Audio ON
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {queueCount > 0 && (
                <span className="text-[11px] text-amber-300/90 animate-pulse">
                  {queueCount} active...
                </span>
              )}
              <button
                type="button"
                data-testid="composer-submit-btn"
                disabled={!prompt.trim()}
                onClick={handleQueue}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold disabled:opacity-40 shadow-lg transition cursor-pointer ${
                  isSeedanceVideo
                    ? 'bg-gradient-to-r from-violet-400 to-fuchsia-400 text-zinc-950 hover:from-violet-300 hover:to-fuchsia-300 shadow-violet-500/25'
                    : 'bg-gradient-to-r from-amber-400 to-orange-400 text-zinc-950 hover:from-amber-300 hover:to-orange-300 shadow-amber-500/20'
                }`}
              >
                <span>
                  {mode === 't2i'
                    ? 'Generate Still ($0)'
                    : isSeedanceVideo
                    ? 'Generate Seedance'
                    : 'Generate Video'}
                </span>
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
