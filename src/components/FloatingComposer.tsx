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
  Loader2,
  Lock,
  Palette,
  SlidersHorizontal,
  Sparkles,
  Unlock,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import type { AspectRatio, BibleEntry, EngineSettings, GenerationMode } from '../types/studio';
import { compilePromptWithBible } from '../utils/promptCompiler';
import { fileToResizedDataUrl } from '../utils/frameGrabber';
import { enhancePromptWithDirector } from '../services/director';

export interface ComposerSubmitPayload {
  rawPrompt: string;
  negativePrompt: string;
  mode: GenerationMode;
  aspectRatio: AspectRatio;
  durationSec: number;
  steps: number;
  cfgScale: number;
  seed: number;
  takeCount: 1 | 2 | 4;
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
  onOpenEngine: () => void;
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

const STYLE_PRESETS = [
  { label: '35mm Cinema', snippet: 'shot on 35mm Kodak Vision3 film, anamorphic lens flare, subtle film grain, golden rim lighting' },
  { label: 'Anime Film', snippet: 'theatrical Japanese anime feature film style, luminous sky lighting, crisp hand-drawn cel shading' },
  { label: 'Cyberpunk Noir', snippet: 'neon-drenched cyberpunk noir cinematography, wet asphalt reflections, volumetric rain, teal and magenta' },
  { label: 'Photoreal Doc', snippet: 'ultra-photorealistic 85mm documentary photography, authentic skin texture, natural available light' },
  { label: '3D Cinema', snippet: 'stylized theatrical 3D animated feature film render, soft subsurface scattering, lush volumetric lighting' },
  { label: 'Retro VHS', snippet: '1990s analog camcorder VHS cinema aesthetic, warm halation, soft lens bloom, nostalgic tones' },
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
  onOpenEngine,
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
  const [showStyleBar, setShowStyleBar] = useState(false);
  const [takeCount, setTakeCount] = useState<1 | 2 | 4>(1);
  const [showExpandedPreview, setShowExpandedPreview] = useState(false);
  const [enhancing, setEnhancing] = useState(false);

  const startInputRef = useRef<HTMLInputElement | null>(null);
  const endInputRef = useRef<HTMLInputElement | null>(null);
  const advancedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!remixRecipe) return;
    setNegativePrompt(remixRecipe.negativePrompt);
    setSeedValue(remixRecipe.seed);
    setSeedLocked(true);
    setSteps(remixRecipe.steps);
    setCfgScale(remixRecipe.cfgScale);
    setDurationSec(remixRecipe.durationSec);
  }, [remixRecipe]);

  useEffect(() => {
    if (!showAdvanced) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAdvanced(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (advancedRef.current && !advancedRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest('[data-testid="toggle-recipe-btn"]')) {
          setShowAdvanced(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onOutside);
    };
  }, [showAdvanced]);

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
      takeCount,
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

  const handleEnhance = async () => {
    if (!prompt.trim() || enhancing) return;
    setEnhancing(true);
    try {
      const res = await enhancePromptWithDirector(prompt, mode);
      onPromptChange(res.enhanced);
    } catch {
      // keep existing prompt
    } finally {
      setEnhancing(false);
    }
  };

  const isOmniVideo = mode !== 't2i' && engineSettings.activeEngine === 'gemini-omni';
  const isSeedanceVideo = mode !== 't2i' && engineSettings.activeEngine === 'seedance-byok';
  const needsVideoSetup =
    mode !== 't2i' &&
    ((engineSettings.activeEngine === 'free-24-7' &&
      engineSettings.freeVideoFallback === 'hf-ltx-space' &&
      !engineSettings.hfToken.trim()) ||
      (engineSettings.activeEngine === 'colab-t4' && !engineSettings.colabUrl.trim()));

  return (
    <div className="pb-4 pt-1 px-4 sm:px-6 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        {/* Shot Recipe Popover */}
        {showAdvanced && (
          <div
            ref={advancedRef}
            data-testid="flow-modal-surface"
            className="flow-modal mb-3 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-white">
                Shot Recipe Controls (Seed Lock, Negative Prompt, Steps &amp; CFG)
              </span>
              <button
                type="button"
                aria-label="Close recipe controls"
                onClick={() => setShowAdvanced(false)}
                className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[1.5]" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-white/65 mb-1.5">Negative Prompt</label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  className="flow-input w-full px-3 py-2 text-[13px]"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[12px] text-white/65 mb-1.5">Seed</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={seedValue}
                      onChange={(e) => {
                        setSeedValue(Number(e.target.value) || 0);
                        setSeedLocked(true);
                      }}
                      className="flow-input w-full px-2 py-2 text-[12px] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setSeedLocked((v) => !v)}
                      data-active={seedLocked ? 'true' : 'false'}
                      title={seedLocked ? 'Seed Locked' : 'Random Seed'}
                      className="flow-btn-glass p-2 cursor-pointer shrink-0"
                    >
                      {seedLocked ? (
                        <Lock className="w-3.5 h-3.5 stroke-[1.6]" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 stroke-[1.6]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeedValue(Math.floor(Math.random() * 2_000_000_000))}
                      title="Roll new seed"
                      className="flow-btn-glass p-2 cursor-pointer shrink-0"
                    >
                      <Dice5 className="w-3.5 h-3.5 stroke-[1.6]" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] text-white/65 mb-1.5">Steps ({steps})</label>
                  <input
                    type="range"
                    min={4}
                    max={40}
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="w-full accent-white mt-2.5 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-white/65 mb-1.5">CFG ({cfgScale})</label>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={0.5}
                    value={cfgScale}
                    onChange={(e) => setCfgScale(Number(e.target.value))}
                    className="w-full accent-white mt-2.5 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Signature Google Flow Floating Obsidian Glass Composer */}
        <div
          data-testid="flow-composer-bar"
          className="flow-composer-shell p-3.5 sm:p-4 space-y-3"
        >
          {/* Top Row: Monochrome Flow Mode Switcher + Bible @TAG Chips */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flow-pill-group inline-flex p-1 max-w-full overflow-x-auto">
              {(
                [
                  { id: 't2i', label: 'Keyframe Still', short: 'Still', icon: ImageIcon },
                  { id: 't2v', label: 'Text to Video', short: 'Video', icon: Clapperboard },
                  { id: 'i2v', label: 'Frames to Video', short: 'Frames', icon: Film },
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
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[32px] text-[13px] font-medium whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-white text-[#121317]'
                        : 'text-white/65 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 stroke-[1.6] shrink-0" />
                    <span className="sm:hidden">{tab.short}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick @TAG Bar */}
            {bibleEntries.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
                {bibleEntries.slice(0, 6).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => appendTag(b.tag)}
                    title={`Insert ${b.tag}: ${b.descriptor}`}
                    className="px-2.5 py-1 text-[11px] font-mono rounded-[32px] bg-white/5 border border-white/15 text-white/80 hover:bg-white/12 hover:border-white/25 hover:text-white shrink-0 transition cursor-pointer"
                  >
                    {b.tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* First Frame -> Last Frame Slots */}
          {(mode === 'i2v' || startFrameDataUrl || endFrameDataUrl) && (
            <div className="grid sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5 p-2.5 rounded-[16px] bg-black/45 border border-white/15">
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
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={startFrameDataUrl}
                    alt="Start frame"
                    className="w-14 h-9 rounded-lg object-cover border border-white/25 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-white truncate">
                      Start Frame Locked
                    </div>
                    <div className="text-[11px] text-white/50 truncate">Opening frame continuity</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartFrameChange(undefined)}
                    aria-label="Clear Start Frame"
                    className="p-1.5 rounded-full text-white/50 hover:text-[#fe6e6e] hover:bg-white/10 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 stroke-[1.6]" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startInputRef.current?.click()}
                  className="flex items-center gap-2 text-[13px] text-white/65 hover:text-white transition py-1.5 px-2 rounded-xl hover:bg-white/6 cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4 stroke-[1.5] text-white/80 shrink-0" />
                  <span className="truncate">
                    <strong className="font-medium text-white">Start Frame</strong> — upload or grab
                  </span>
                </button>
              )}

              <ArrowRight className="w-4 h-4 stroke-[1.5] text-white/35 hidden sm:block" />

              {/* End Frame Slot */}
              {endFrameDataUrl ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={endFrameDataUrl}
                    alt="End frame"
                    className="w-14 h-9 rounded-lg object-cover border border-white/25 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-white truncate">
                      End Frame Locked
                    </div>
                    <div className="text-[11px] text-white/50 truncate">Target closing frame</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEndFrameChange(undefined)}
                    aria-label="Clear End Frame"
                    className="p-1.5 rounded-full text-white/50 hover:text-[#fe6e6e] hover:bg-white/10 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 stroke-[1.6]" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => endInputRef.current?.click()}
                  className="flex items-center gap-2 text-[13px] text-white/55 hover:text-white transition py-1.5 px-2 rounded-xl hover:bg-white/6 cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4 stroke-[1.5] text-white/60 shrink-0" />
                  <span className="truncate">
                    <strong className="font-medium text-white/85">End Frame</strong> (optional)
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Prompt Textarea */}
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
                  ? 'What do you want to create? Use @MIRA or @LOC-D from your Bible (Ctrl+Enter)'
                  : 'Direct camera motion, action & spoken "dialogue"... Use @MIRA or @LOC-D (Ctrl+Enter)'
              }
              className="w-full bg-transparent text-[16px] leading-[24px] text-white placeholder:text-white/50 outline-none resize-none pr-2"
            />
          </div>

          {/* 1-Click Camera Motion Presets Drawer */}
          {showCameraBar && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 px-1">
              <span className="text-[11px] uppercase tracking-wider text-white/45 shrink-0">
                Camera:
              </span>
              {CAMERA_PRESETS.map((cam) => (
                <button
                  key={cam.label}
                  type="button"
                  onClick={() => appendText(cam.snippet)}
                  className="flow-btn-glass px-3 py-1 text-[12px] shrink-0 cursor-pointer"
                >
                  + {cam.label}
                </button>
              ))}
            </div>
          )}

          {/* 1-Click Cinema Look Presets Drawer */}
          {showStyleBar && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 px-1">
              <span className="text-[11px] uppercase tracking-wider text-white/45 shrink-0">
                Look:
              </span>
              {STYLE_PRESETS.map((st) => (
                <button
                  key={st.label}
                  type="button"
                  onClick={() => appendText(st.snippet)}
                  className="flow-btn-glass px-3 py-1 text-[12px] shrink-0 cursor-pointer"
                >
                  + {st.label}
                </button>
              ))}
            </div>
          )}

          {/* Bible Expansion Indicator */}
          {compiled.appliedTags.length > 0 && (
            <div className="text-[12px] bg-white/5 border border-white/15 rounded-[16px] px-3 py-2 text-white/85">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 stroke-[1.6] text-white" />
                  Bible Auto-Expanded: <strong className="font-medium">{compiled.appliedTags.join(', ')}</strong>
                  {compiled.suggestedSeed !== undefined && !seedLocked && (
                    <span className="text-white/50">· Seed {compiled.suggestedSeed}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowExpandedPreview((v) => !v)}
                  className="underline underline-offset-4 text-white/80 hover:text-white cursor-pointer"
                >
                  {showExpandedPreview ? 'Hide' : 'Preview'}
                </button>
              </div>
              {showExpandedPreview && (
                <p className="mt-2 text-white/70 text-[12px] leading-[18px] border-t border-white/10 pt-2">
                  {compiled.compiledPrompt}
                </p>
              )}
            </div>
          )}

          {/* Honest Pre-Flight Notice when Video GPU is not yet connected */}
          {needsVideoSetup && (
            <div
              data-testid="video-gpu-notice"
              className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-[14px] bg-[#f59e0b]/10 border border-[#f59e0b]/35 text-[12px] text-white/90"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b] shrink-0" />
                <span>
                  Real AI video needs a <strong className="font-medium text-white">Free HF Token ($0)</strong>,{' '}
                  <strong className="font-medium text-white">Free Colab T4</strong>, or cloud API key.
                </span>
              </span>
              <button
                type="button"
                data-testid="composer-setup-gpu-btn"
                onClick={onOpenEngine}
                className="flow-cta-primary px-3 py-1 text-[11px] cursor-pointer shrink-0"
              >
                Connect Video GPU
              </button>
            </div>
          )}

          {/* Bottom Controls Bar */}
          <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 pt-2.5 border-t border-white/15">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <select
                aria-label="Aspect ratio"
                value={aspectRatio}
                onChange={(e) => onAspectRatioChange(e.target.value as AspectRatio)}
                className="flow-select-pill h-9 px-2.5 text-[12px] font-medium cursor-pointer"
              >
                <option value="16:9">16:9 Cinema</option>
                <option value="9:16">9:16 Reels</option>
                <option value="1:1">1:1 Square</option>
                <option value="21:9">21:9 Anamorphic</option>
              </select>

              <select
                aria-label="Takes"
                data-testid="take-count-select"
                value={takeCount}
                onChange={(e) => setTakeCount(Number(e.target.value) as 1 | 2 | 4)}
                title="Generate multiple seed variations in one click"
                className="flow-select-pill h-9 px-2.5 text-[12px] font-medium cursor-pointer"
              >
                <option value={1}>1× Take</option>
                <option value={2}>2× Takes</option>
                <option value={4}>4× Takes</option>
              </select>

              {mode !== 't2i' && (
                <select
                  aria-label="Duration"
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="flow-select-pill h-9 px-2.5 text-[12px] font-medium cursor-pointer"
                >
                  <option value={3}>3s</option>
                  <option value={4}>4s</option>
                  <option value={5}>5s</option>
                  <option value={6}>6s</option>
                  <option value={8}>8s</option>
                  <option value={10}>10s</option>
                  {isOmniVideo && <option value={12}>12s</option>}
                  {isOmniVideo && <option value={15}>15s</option>}
                </select>
              )}

              <button
                type="button"
                data-testid="magic-enhance-btn"
                disabled={!prompt.trim() || enhancing}
                onClick={() => void handleEnhance()}
                title="Expand your prompt into 35mm cinematography while keeping @TAGs intact"
                className="flow-btn-glass h-9 px-2.5 flex items-center gap-1.5 text-[12px] font-medium disabled:opacity-40 cursor-pointer"
              >
                {enhancing ? (
                  <Loader2 className="w-3.5 h-3.5 stroke-[1.6] animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 stroke-[1.6]" />
                )}
                <span>Enhance</span>
              </button>

              <button
                type="button"
                data-testid="toggle-style-presets-btn"
                data-active={showStyleBar ? 'true' : 'false'}
                onClick={() => setShowStyleBar((v) => !v)}
                className="flow-btn-glass h-9 px-2.5 flex items-center gap-1.5 text-[12px] font-medium cursor-pointer"
              >
                <Palette className="w-3.5 h-3.5 stroke-[1.6]" />
                <span>Look</span>
              </button>

              <button
                type="button"
                data-testid="toggle-camera-presets-btn"
                data-active={showCameraBar ? 'true' : 'false'}
                onClick={() => setShowCameraBar((v) => !v)}
                className="flow-btn-glass h-9 px-2.5 flex items-center gap-1.5 text-[12px] font-medium cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 stroke-[1.6]" />
                <span>Camera</span>
              </button>

              <button
                type="button"
                data-testid="toggle-recipe-btn"
                data-active={showAdvanced || seedLocked ? 'true' : 'false'}
                onClick={() => setShowAdvanced((v) => !v)}
                className="flow-btn-glass h-9 px-2.5 flex items-center gap-1.5 text-[12px] font-medium cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 stroke-[1.6]" />
                <span>Recipe</span>
                {seedLocked && <Lock className="w-3 h-3 stroke-[1.8]" />}
              </button>

              {mode !== 't2i' &&
                !needsVideoSetup &&
                (engineSettings.activeEngine === 'free-24-7' && engineSettings.freeAutoAudio ? (
                  <span className="hidden xl:inline-flex items-center gap-1.5 h-9 px-2.5 text-[11px] rounded-[32px] bg-white/5 border border-white/15 text-white/80 whitespace-nowrap">
                    <Volume2 className="w-3.5 h-3.5 stroke-[1.6] text-[#29c58f]" />
                    Foley ON
                  </span>
                ) : isOmniVideo || (isSeedanceVideo && engineSettings.seedanceAudio) ? (
                  <span className="hidden xl:inline-flex items-center gap-1.5 h-9 px-2.5 text-[11px] rounded-[32px] bg-white/5 border border-white/15 text-white/80 whitespace-nowrap">
                    <Volume2 className="w-3.5 h-3.5 stroke-[1.6] text-[#c2e7ff]" />
                    Audio ON
                  </span>
                ) : null)}
            </div>

            <div className="flex items-center gap-2 ml-auto shrink-0">
              {queueCount > 0 && (
                <span className="text-[12px] text-white/75 animate-pulse whitespace-nowrap">
                  {queueCount} active...
                </span>
              )}
              <button
                type="button"
                data-testid="composer-submit-btn"
                disabled={!prompt.trim()}
                onClick={handleQueue}
                className="flow-cta-primary h-10 px-5 flex items-center gap-2 text-[13px] disabled:opacity-65 cursor-pointer whitespace-nowrap"
              >
                <span>
                  {mode === 't2i'
                    ? takeCount > 1
                      ? `Generate ${takeCount}× Stills`
                      : 'Generate Still'
                    : isOmniVideo
                    ? 'Generate Omni 1.2'
                    : isSeedanceVideo
                    ? 'Generate Seedance'
                    : takeCount > 1
                    ? `Generate ${takeCount}× Videos`
                    : 'Generate Video'}
                </span>
                <ArrowUp className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
