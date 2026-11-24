import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  Sparkles,
  Volume2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  EngineSettings,
  OmniResolution,
  SeedanceProvider,
  SeedanceResolution,
} from '../types/studio';
import {
  pingColabBackend,
  verifyGeminiOmniApiKey,
  verifySeedanceApiKey,
  type ColabHealthStatus,
  type SeedanceKeyStatus,
  type ServerKeyCapabilities,
} from '../services/engine';

interface EngineModalProps {
  open: boolean;
  settings: EngineSettings;
  colabHealth: ColabHealthStatus | null;
  serverKeys: ServerKeyCapabilities;
  onClose: () => void;
  onSaveSettings: (next: EngineSettings) => Promise<void>;
  onHealthUpdate: (status: ColabHealthStatus) => void;
}

const REPLICATE_MODELS = [
  { id: 'bytedance/seedance-2.5', label: 'Seedance 2.5 (Latest Flagship + Native Audio)' },
  { id: 'bytedance/seedance-2.0', label: 'Seedance 2.0 (Cinematic T2V / I2V + Audio)' },
  { id: 'bytedance/seedance-1.5-pro', label: 'Seedance 1.5 Pro (Audio + Lip-Sync)' },
  { id: 'bytedance/seedance-1-pro', label: 'Seedance 1.0 Pro (Fast / Lower Cost)' },
];

const FAL_MODELS = [
  { id: 'bytedance/seedance-2.5/text-to-video', label: 'Seedance 2.5 (Latest — Auto T2V/I2V)' },
  { id: 'bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0 (Auto T2V/I2V + Audio)' },
  {
    id: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    label: 'Seedance 1.0 Pro (Fast / Lower Cost)',
  },
];

export function EngineModal({
  open,
  settings,
  colabHealth,
  serverKeys,
  onClose,
  onSaveSettings,
  onHealthUpdate,
}: EngineModalProps) {
  const [draft, setDraftState] = useState<EngineSettings>(settings);
  const dirtyRef = useRef(false);
  const wasOpenRef = useRef(false);
  const [testingColab, setTestingColab] = useState(false);
  const [testingOmni, setTestingOmni] = useState(false);
  const [omniStatus, setOmniStatus] = useState<SeedanceKeyStatus | null>(null);
  const [testingSeedance, setTestingSeedance] = useState(false);
  const [seedanceStatus, setSeedanceStatus] = useState<SeedanceKeyStatus | null>(null);

  const setDraft: typeof setDraftState = (next) => {
    dirtyRef.current = true;
    setDraftState(next);
  };

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      dirtyRef.current = false;
      setDraftState(settings);
      setOmniStatus(null);
      setSeedanceStatus(null);
    } else if (open && !dirtyRef.current) {
      setDraftState(settings);
    }
    wasOpenRef.current = open;
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleTestColab = async () => {
    setTestingColab(true);
    try {
      const result = await pingColabBackend(draft.colabUrl);
      onHealthUpdate(result);
      if (result.online) {
        setDraft((prev) => ({ ...prev, activeEngine: 'colab-t4' }));
      }
    } finally {
      setTestingColab(false);
    }
  };

  const handleTestOmni = async () => {
    setTestingOmni(true);
    try {
      const result = await verifyGeminiOmniApiKey(draft.geminiApiKey);
      setOmniStatus(result);
      if (result.valid) {
        setDraft((prev) => ({ ...prev, activeEngine: 'gemini-omni' }));
      }
    } finally {
      setTestingOmni(false);
    }
  };

  const handleTestSeedance = async () => {
    setTestingSeedance(true);
    try {
      const result = await verifySeedanceApiKey(draft.seedanceProvider, draft.seedanceApiKey);
      setSeedanceStatus(result);
      if (result.valid) {
        setDraft((prev) => ({ ...prev, activeEngine: 'seedance-byok' }));
      }
    } finally {
      setTestingSeedance(false);
    }
  };

  const handleProviderChange = (provider: SeedanceProvider) => {
    const defaultModel =
      provider === 'replicate' ? REPLICATE_MODELS[0].id : FAL_MODELS[0].id;
    setDraft((prev) => ({ ...prev, seedanceProvider: provider, seedanceModel: defaultModel }));
    setSeedanceStatus(null);
  };

  const handleSave = async () => {
    await onSaveSettings(draft);
    onClose();
  };

  const activeSeedanceModels =
    draft.seedanceProvider === 'replicate' ? REPLICATE_MODELS : FAL_MODELS;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] rounded-2xl border border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              4-Engine Cinema Compute (2 Free Forever + Gemini Omni 1.2 Flash + Seedance 2.5)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Draft unlimited keyframes at $0, render free videos on Wan 2.2 14B / Colab T4, or switch to official Google Gemini Omni 1.2 Flash (3s–15s, 4K, Turn Edit/Extend) or Seedance 2.5.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* 4 Engine Mode Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              data-testid="select-engine-free"
              onClick={() => setDraft({ ...draft, activeEngine: 'free-24-7' })}
              className={`text-left p-2.5 rounded-xl border transition ${
                draft.activeEngine === 'free-24-7'
                  ? 'border-amber-400/60 bg-amber-500/10'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Free 24/7
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
                  $0
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">
                FLUX + Wan 2.2 14B First→Last &amp; FP8 + LTX cascade.
              </p>
            </button>

            <button
              type="button"
              data-testid="select-engine-colab"
              onClick={() => setDraft({ ...draft, activeEngine: 'colab-t4' })}
              className={`text-left p-2.5 rounded-xl border transition ${
                draft.activeEngine === 'colab-t4'
                  ? 'border-emerald-400/60 bg-emerald-500/10'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  Colab T4
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 shrink-0">
                  $0 GPU
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">
                Free 16 GB T4: SDXL, CogVideoX-2B, LTX, Wan2.1.
              </p>
            </button>

            <button
              type="button"
              data-testid="select-engine-omni"
              onClick={() => setDraft({ ...draft, activeEngine: 'gemini-omni' })}
              className={`text-left p-2.5 rounded-xl border transition ${
                draft.activeEngine === 'gemini-omni'
                  ? 'border-sky-400/70 bg-sky-500/15'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  Omni 1.2
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 shrink-0">
                  4K·15s
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">
                Google Gemini Omni 1.2 Flash + Turn Edit/Extend 30s.
              </p>
            </button>

            <button
              type="button"
              data-testid="select-engine-seedance"
              onClick={() => setDraft({ ...draft, activeEngine: 'seedance-byok' })}
              className={`text-left p-2.5 rounded-xl border transition ${
                draft.activeEngine === 'seedance-byok'
                  ? 'border-violet-400/70 bg-violet-500/15'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  Seedance 2.5
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 shrink-0">
                  BYOK
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">
                ByteDance Seedance 2.5 / 2.0 + Audio via Replicate/fal.
              </p>
            </button>
          </div>

          {/* Engine 3 Config: Official Google Gemini Omni 1.2 Flash */}
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-sky-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                Engine 3: Official Google Gemini Omni 1.2 Flash (3s–15s · 360p–4K · Turn Edit/Extend)
              </div>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-sky-200 bg-sky-500/15 border border-sky-500/30 hover:bg-sky-500/25"
              >
                Get Google AI Studio Key
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="text-[11px] text-zinc-400 leading-relaxed">
              Supports <strong className="text-zinc-200">First→Last Frame</strong> (3s–10s),{' '}
              <strong className="text-zinc-200">Bible Multi-Reference R2V</strong>, native audio, and{' '}
              <strong className="text-sky-300">Turn-by-Turn Editing &amp; +10s Extensions (up to 30s)</strong>.{' '}
              <em>Note: Google&apos;s API requires billing on your AI Studio key (~$0.023/s at 360p, ~$0.07/s at 720p); if unbilled, Cabardo Studio auto-falls back to $0 Wan 2.2 14B.</em>
            </div>

            {serverKeys.gemini && (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Encrypted Vercel Server Key active for Google Gemini API.</span>
              </div>
            )}

            <div className="grid sm:grid-cols-3 gap-2.5 items-end">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Omni 1.2 Resolution</label>
                <select
                  data-testid="omni-resolution-select"
                  value={draft.omniResolution}
                  onChange={(e) =>
                    setDraft({ ...draft, omniResolution: e.target.value as OmniResolution })
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value="360p">360p Fast Preview (~$0.023/s)</option>
                  <option value="720p">720p HD Default (~$0.07/s)</option>
                  <option value="1080p">1080p Full HD (~$0.104/s)</option>
                  <option value="4k">4K Ultra HD (~$0.209/s)</option>
                </select>
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    data-testid="omni-apikey-input"
                    autoComplete="off"
                    value={draft.geminiApiKey}
                    onChange={(e) => setDraft({ ...draft, geminiApiKey: e.target.value })}
                    placeholder={
                      serverKeys.gemini
                        ? 'Using encrypted server key (paste another key to override)'
                        : 'AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                    }
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-sky-200 placeholder:text-zinc-600 focus:border-sky-500/60 outline-none"
                  />
                </div>
                <button
                  type="button"
                  data-testid="omni-verify-btn"
                  disabled={testingOmni || (!draft.geminiApiKey.trim() && !serverKeys.gemini)}
                  onClick={() => void handleTestOmni()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/20 border border-sky-500/40 text-sky-200 hover:bg-sky-500/30 disabled:opacity-40 shrink-0"
                >
                  {testingOmni ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Verify Key
                </button>
              </div>
            </div>

            {omniStatus && (
              <div
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                  omniStatus.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                {omniStatus.valid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Verified: <strong>{omniStatus.account}</strong> — Gemini Omni 1.2 Flash active!
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{omniStatus.error}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Engine 4 Config: Official ByteDance Seedance (BYOK) */}
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/15 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-violet-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                Engine 4: Official ByteDance Seedance (Latest 2.5 / 2.0 BYOK)
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-violet-200 bg-violet-500/15 border border-violet-500/30 hover:bg-violet-500/25"
                >
                  Get Replicate Key
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://fal.ai/dashboard/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-300 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800"
                >
                  Get fal.ai Key
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400 leading-relaxed">
              <strong className="text-emerald-300">Hybrid $0 Saving:</strong> Keyframe stills still render at{' '}
              <strong className="text-zinc-200">$0</strong>. Your API key is stored{' '}
              <strong className="text-zinc-200">only locally in this browser&apos;s IndexedDB</strong> and only used when generating Seedance videos (T2V / Frames-to-Video).
            </div>

            <div className="grid sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">API Provider</label>
                <select
                  data-testid="seedance-provider-select"
                  value={draft.seedanceProvider}
                  onChange={(e) => handleProviderChange(e.target.value as SeedanceProvider)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value="replicate">Replicate (Recommended)</option>
                  <option value="fal">fal.ai Queue API</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-zinc-400 mb-1">Seedance Model Version</label>
                <select
                  data-testid="seedance-model-select"
                  value={draft.seedanceModel}
                  onChange={(e) => setDraft({ ...draft, seedanceModel: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  {activeSeedanceModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-2.5 items-end">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Video Resolution</label>
                <select
                  value={draft.seedanceResolution}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      seedanceResolution: e.target.value as SeedanceResolution,
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value="480p">480p (Fastest / Cheapest)</option>
                  <option value="720p">720p HD (Balanced)</option>
                  <option value="1080p">1080p Full HD (Cinema)</option>
                </select>
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.seedanceAudio}
                  onChange={(e) => setDraft({ ...draft, seedanceAudio: e.target.checked })}
                  className="accent-violet-400"
                />
                <Volume2 className="w-3.5 h-3.5 text-violet-400" />
                <span>Generate Synchronized Native Audio (SFX, music &amp; dialogue)</span>
              </label>
            </div>

            {((draft.seedanceProvider === 'replicate' && serverKeys.replicate) ||
              (draft.seedanceProvider === 'fal' && serverKeys.fal)) && (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Encrypted Vercel Server Key active for{' '}
                  <strong>{draft.seedanceProvider === 'replicate' ? 'Replicate' : 'fal.ai'}</strong> — Seedance 2.5 is ready immediately (optional override below).
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  data-testid="seedance-apikey-input"
                  autoComplete="off"
                  value={draft.seedanceApiKey}
                  onChange={(e) => setDraft({ ...draft, seedanceApiKey: e.target.value })}
                  placeholder={
                    (draft.seedanceProvider === 'replicate' && serverKeys.replicate) ||
                    (draft.seedanceProvider === 'fal' && serverKeys.fal)
                      ? 'Using encrypted server key (paste another key only to override)'
                      : draft.seedanceProvider === 'replicate'
                      ? 'r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                      : 'xxxxxxxx-xxxx-xxxx:xxxxxxxxxxxxxxxx'
                  }
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-violet-200 placeholder:text-zinc-600 focus:border-violet-500/60 outline-none"
                />
              </div>
              <button
                type="button"
                data-testid="seedance-verify-btn"
                disabled={
                  testingSeedance ||
                  (!draft.seedanceApiKey.trim() &&
                    !(draft.seedanceProvider === 'replicate'
                      ? serverKeys.replicate
                      : serverKeys.fal))
                }
                onClick={() => void handleTestSeedance()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/20 border border-violet-500/40 text-violet-200 hover:bg-violet-500/30 disabled:opacity-40"
              >
                {testingSeedance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Verify Key
              </button>
            </div>

            {seedanceStatus && (
              <div
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                  seedanceStatus.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                {seedanceStatus.valid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Key Verified: <strong>{seedanceStatus.account}</strong> — Seedance active!
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{seedanceStatus.error || 'Key validation failed.'}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Engine 1 Config */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-zinc-200">
              Engine 1: Free 24/7 Cloud Options ($0 Always-On)
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Keyframe Image Model</label>
                <select
                  value={draft.freeImageModel}
                  onChange={(e) =>
                    setDraft({ ...draft, freeImageModel: e.target.value as 'flux' | 'turbo' })
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value="flux">FLUX.1-schnell Direct ZeroGPU + Pollinations</option>
                  <option value="turbo">Turbo (Ultra-Fast Drafts)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Free Video Strategy</label>
                <select
                  value={draft.freeVideoFallback}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      freeVideoFallback: e.target.value as 'hf-ltx-space' | 'ken-burns-local',
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value="hf-ltx-space">
                    Multi-Space Wan 2.2 14B + LTX-Video ($0 Cascade) → Director Motion
                  </option>
                  <option value="ken-burns-local">Instant 2-Stage Keyframe + Cinema Motion</option>
                </select>
              </div>
            </div>
          </div>

          {/* Engine 2 Config (Colab T4 Bridge) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-200">
                Engine 2: Google Colab T4 16 GB Tunnel Setup ($0 Dedicated GPU)
              </div>
              <div className="flex items-center gap-1.5">
                <a
                  href="https://colab.research.google.com/github/almarsancare-maker/flow-studio-pwa/blob/main/colab/FlowStudio_Colab_T4_Backend.ipynb"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-emerald-950 bg-emerald-400 hover:bg-emerald-300"
                >
                  1-Click Open in Colab
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="/FlowStudio_Colab_T4_Backend.ipynb"
                  download="FlowStudio_Colab_T4_Backend.ipynb"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-zinc-300 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800"
                >
                  <Download className="w-3 h-3" />
                  Download Colab Notebook
                </a>
              </div>
            </div>

            <ol className="text-[11px] text-zinc-400 space-y-1 list-decimal list-inside">
              <li>
                Click <strong className="text-emerald-300">1-Click Open in Colab</strong> above and confirm Runtime → T4 GPU.
              </li>
              <li>
                Click <strong className="text-zinc-200">Runtime → Run all</strong> (~45s — code is collapsed cleanly into 2 Play cards).
              </li>
              <li>
                Paste the printed <code className="text-emerald-300">https://*.trycloudflare.com</code> URL below and click Test Connection.
              </li>
            </ol>

            <div className="flex items-center gap-2">
              <input
                type="url"
                value={draft.colabUrl}
                onChange={(e) => setDraft({ ...draft, colabUrl: e.target.value })}
                placeholder="https://your-random-slug.trycloudflare.com"
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-zinc-950 border border-zinc-800 text-emerald-200 placeholder:text-zinc-600 focus:border-emerald-500/50 outline-none"
              />
              <button
                type="button"
                disabled={testingColab || !draft.colabUrl.trim()}
                onClick={() => void handleTestColab()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                {testingColab ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Test Connection
              </button>
            </div>

            {colabHealth && (
              <div
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                  colabHealth.online
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                {colabHealth.online ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Connected: <strong>{colabHealth.gpuName}</strong> ({colabHealth.vramFreeGb}/
                      {colabHealth.vramTotalGb} GB VRAM free)
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{colabHealth.error || 'Could not reach Colab tunnel.'}</span>
                  </>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Colab Image Model</label>
                <select
                  value={draft.colabModelImage}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      colabModelImage: e.target.value as EngineSettings['colabModelImage'],
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value="sdxl-turbo">SDXL-Turbo (~2s per keyframe)</option>
                  <option value="sdxl-base">SDXL 1.0 Base (1024px Photorealistic)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Colab Video Model</label>
                <select
                  value={draft.colabModelVideo}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      colabModelVideo: e.target.value as EngineSettings['colabModelVideo'],
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
                >
                  <option value="cogvideox-2b">CogVideoX-2B (Best T4 16GB T2V)</option>
                  <option value="ltx-video">LTX-Video (Fast T2V + Start-Frame I2V)</option>
                  <option value="wan2.1-1.3b">Wan2.1-1.3B (High-Motion Open T2V)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 text-zinc-950 hover:bg-amber-300"
          >
            Save Engine Settings
          </button>
        </div>
      </div>
    </div>
  );
}
