import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
  FreeImageModel,
  OmniResolution,
  SeedanceProvider,
  SeedanceResolution,
} from '../types/studio';
import {
  pingColabBackend,
  verifyGeminiOmniApiKey,
  verifyHfToken,
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
  const [testingHf, setTestingHf] = useState(false);
  const [hfStatus, setHfStatus] = useState<SeedanceKeyStatus | null>(null);
  const [testingOmni, setTestingOmni] = useState(false);
  const [omniStatus, setOmniStatus] = useState<SeedanceKeyStatus | null>(null);
  const [testingSeedance, setTestingSeedance] = useState(false);
  const [seedanceStatus, setSeedanceStatus] = useState<SeedanceKeyStatus | null>(null);
  const [showPaidApis, setShowPaidApis] = useState(false);

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
      setShowPaidApis(
        settings.activeEngine === 'gemini-omni' || settings.activeEngine === 'seedance-byok'
      );
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

  const handleTestHf = async () => {
    setTestingHf(true);
    try {
      const result = await verifyHfToken(draft.hfToken);
      setHfStatus(result);
      if (result.valid) {
        const next: EngineSettings = { ...draft, activeEngine: 'free-24-7', hfToken: draft.hfToken.trim() };
        setDraftState(next);
        dirtyRef.current = false;
        await onSaveSettings(next);
      }
    } finally {
      setTestingHf(false);
    }
  };

  const handleTestColab = async () => {
    setTestingColab(true);
    try {
      const result = await pingColabBackend(draft.colabUrl);
      onHealthUpdate(result);
      if (result.online) {
        const next: EngineSettings = { ...draft, activeEngine: 'colab-t4', colabUrl: draft.colabUrl.trim() };
        setDraftState(next);
        dirtyRef.current = false;
        await onSaveSettings(next);
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
        const next: EngineSettings = { ...draft, activeEngine: 'gemini-omni', geminiApiKey: draft.geminiApiKey.trim() };
        setDraftState(next);
        dirtyRef.current = false;
        await onSaveSettings(next);
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
        const next: EngineSettings = { ...draft, activeEngine: 'seedance-byok', seedanceApiKey: draft.seedanceApiKey.trim() };
        setDraftState(next);
        dirtyRef.current = false;
        await onSaveSettings(next);
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
      className="fixed inset-0 z-[1050] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        data-testid="flow-modal-surface"
        className="flow-modal w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-white/15 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-medium text-white flex items-center gap-2 tracking-[-0.01em]">
              <Cpu className="w-4 h-4 stroke-[1.6] text-white" />
              Cabardo Studio Compute — Video &amp; Image Backends
            </h2>
            <p className="text-[13px] text-white/55 mt-1 leading-[19px]">
              Stills run instantly ($0). Real AI video requires one compute backend below: a free
              Hugging Face Read token, Free Google Colab T4 GPU, or an optional paid cloud API key.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close compute modal"
            onClick={onClose}
            className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.6]" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          {/* Primary Hero Cards: 2 Free-Tier Video Compute Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              data-testid="select-engine-free"
              onClick={() => setDraft({ ...draft, activeEngine: 'free-24-7' })}
              className={`text-left p-4 rounded-[16px] border transition cursor-pointer ${draft.activeEngine === 'free-24-7'
                ? 'border-white bg-white/10'
                : 'border-white/15 bg-white/5 hover:border-white/25'
                }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 stroke-[1.6] shrink-0" />
                  HF ZeroGPU Cloud
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-[32px] bg-white/10 text-[#29c58f] border border-white/15 shrink-0">
                  FREE HF TOKEN
                </span>
              </div>
              <p className="text-[12px] text-white/60 mt-2 leading-[18px]">
                Runs flagship Lightricks LTX-2.5 22B (native video + speech + audio), LTX-2.3
                First→Last &amp; Wan 2.2 14B using your free Hugging Face Read token.
              </p>
            </button>

            <button
              type="button"
              data-testid="select-engine-colab"
              onClick={() => setDraft({ ...draft, activeEngine: 'colab-t4' })}
              className={`text-left p-4 rounded-[16px] border transition cursor-pointer ${draft.activeEngine === 'colab-t4'
                ? 'border-white bg-white/10'
                : 'border-white/15 bg-white/5 hover:border-white/25'
                }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium text-white flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 stroke-[1.6] shrink-0" />
                  Free Google Colab T4
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-[32px] bg-white/10 text-[#29c58f] border border-white/15 shrink-0">
                  $0 · 16 GB GPU
                </span>
              </div>
              <p className="text-[12px] text-white/60 mt-2 leading-[18px]">
                Dedicated free NVIDIA T4 16 GB GPU: 4-bit Wan 2.2 TI2V-5B (Apache 2.0), LTX-Video
                0.9.7 &amp; AudioLDM2 with zero ZeroGPU quota blocks.
              </p>
            </button>
          </div>

          {/* Engine 1 Config (HF ZeroGPU + Instant Stills) */}
          <div className="rounded-[16px] border border-white/15 bg-white/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 stroke-[1.6] text-[#29c58f]" />
                HF ZeroGPU Options (Free Account Required for Video)
              </div>
              <span className="text-[11px] text-white/50">No Credit Card</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-white/60 mb-1.5">
                  Keyframe Image Model
                </label>
                <select
                  data-testid="free-image-model-select"
                  value={draft.freeImageModel}
                  onChange={(e) =>
                    setDraft({ ...draft, freeImageModel: e.target.value as FreeImageModel })
                  }
                  className="flow-input w-full px-3 py-2 text-[13px] cursor-pointer"
                >
                  <option value="flux" className="bg-[#131314]">FLUX.1-schnell (HF Token / Turbo fallback)</option>
                  <option value="flux-dev" className="bg-[#131314]">FLUX.1-dev Pro (Requires HF Token)</option>
                  <option value="sd35-turbo" className="bg-[#131314]">SD 3.5 Large Turbo (Requires HF Token)</option>
                  <option value="turbo" className="bg-[#131314]">Pollinations Turbo (Instant, No Token)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] text-white/60 mb-1.5">
                  Video Mode
                </label>
                <select
                  value={draft.freeVideoFallback}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      freeVideoFallback: e.target.value as 'hf-ltx-space' | 'ken-burns-local',
                    })
                  }
                  className="flow-input w-full px-3 py-2 text-[13px] cursor-pointer"
                >
                  <option value="hf-ltx-space" className="bg-[#131314]">
                    LTX-2.5 22B (Native Audio) + Wan 2.2 14B
                  </option>
                  <option value="ken-burns-local" className="bg-[#131314]">
                    Still Pan/Zoom Only (No AI Video)
                  </option>
                </select>
              </div>
            </div>

            {/* Free Hugging Face Token ($0 — unlocks 5x ZeroGPU quota so Wan 2.2 & LTX-Video actually run!) */}
            <div className="rounded-[12px] border border-white/15 bg-black/40 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[12px] font-medium text-white">
                  Free Hugging Face Token ($0 — Required for Wan 2.2 &amp; LTX-Video ZeroGPU)
                </label>
                <a
                  href="https://huggingface.co/settings/tokens/new?tokenType=read"
                  target="_blank"
                  rel="noreferrer"
                  className="flow-btn-glass inline-flex items-center gap-1 px-2.5 py-1 text-[11px]"
                >
                  Get Free Token ($0)
                  <ExternalLink className="w-3 h-3 stroke-[1.6]" />
                </a>
              </div>
              <p className="text-[11px] text-white/55 leading-[16px]">
                ZeroGPU blocks anonymous video requests immediately. A free Read token unlocks real
                Wan 2.2 14B, LTX-Video &amp; MMAudio directly in your browser (no credit card).
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-3.5 h-3.5 text-white/45 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    data-testid="hf-token-input"
                    autoComplete="off"
                    value={draft.hfToken}
                    onChange={(e) => {
                      setDraft({ ...draft, hfToken: e.target.value });
                      setHfStatus(null);
                    }}
                    placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="flow-input w-full pl-8 pr-3 py-2 text-[12px] font-mono"
                  />
                </div>
                <button
                  type="button"
                  data-testid="hf-verify-btn"
                  disabled={testingHf || !draft.hfToken.trim()}
                  onClick={() => void handleTestHf()}
                  className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium disabled:opacity-40 cursor-pointer shrink-0"
                >
                  {testingHf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Verify Token
                </button>
              </div>
              {hfStatus && (
                <div
                  className={`flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border ${hfStatus.valid
                    ? 'bg-white/5 border-[#29c58f]/40 text-white'
                    : 'bg-[#b22f25]/20 border-[#fe6e6e]/40 text-[#fe6e6e]'
                    }`}
                >
                  {hfStatus.valid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                      <span>
                        Verified <strong>{hfStatus.account}</strong> — 5× Free ZeroGPU Video Quota active!
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-[#fe6e6e] shrink-0" />
                      <span>{hfStatus.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[12px] bg-black/45 border border-white/15 text-[12px] text-white/85 cursor-pointer">
              <input
                type="checkbox"
                data-testid="free-auto-audio-toggle"
                checked={draft.freeAutoAudio}
                onChange={(e) => setDraft({ ...draft, freeAutoAudio: e.target.checked })}
                className="accent-white"
              />
              <Volume2 className="w-4 h-4 stroke-[1.6] text-[#29c58f] shrink-0" />
              <span>
                <strong className="font-medium text-white">
                  Auto-Sync AI Foley &amp; Sound Effects ($0 MMAudio)
                </strong>{' '}
                — analyzes generated video frames and muxes realistic synced audio.
              </span>
            </label>
          </div>

          {/* Engine 2 Config (Colab T4 Bridge) */}
          <div className="rounded-[16px] border border-white/15 bg-white/[0.03] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[13px] font-medium text-white">
                Google Colab T4 16 GB Tunnel Setup ($0 Dedicated GPU)
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="https://colab.research.google.com/github/almarsancare-maker/flow-studio-pwa/blob/main/colab/FlowStudio_Colab_T4_Backend.ipynb"
                  target="_blank"
                  rel="noreferrer"
                  className="flow-cta-primary flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
                >
                  Open in Colab
                  <ExternalLink className="w-3 h-3 stroke-[1.8]" />
                </a>
                <a
                  href="/FlowStudio_Colab_T4_Backend.ipynb"
                  download="FlowStudio_Colab_T4_Backend.ipynb"
                  className="flow-btn-glass flex items-center gap-1.5 px-3 py-1.5 text-[11px]"
                >
                  <Download className="w-3 h-3 stroke-[1.6]" />
                  Download Notebook
                </a>
              </div>
            </div>

            <ol className="text-[12px] text-white/60 space-y-1 list-decimal list-inside leading-[18px]">
              <li>
                Open the notebook in Colab and confirm <strong className="text-white font-medium">Runtime → T4 GPU</strong>.
              </li>
              <li>
                Run <strong className="text-white font-medium">Runtime → Run all</strong> (~45s).
              </li>
              <li>
                Paste the <code className="font-mono text-white/85">https://*.trycloudflare.com</code> URL below and click Test Connection.
              </li>
            </ol>

            <div className="flex items-center gap-2">
              <input
                type="url"
                value={draft.colabUrl}
                onChange={(e) => setDraft({ ...draft, colabUrl: e.target.value })}
                placeholder="https://your-random-slug.trycloudflare.com"
                className="flow-input flex-1 px-3 py-2 text-[12px] font-mono"
              />
              <button
                type="button"
                disabled={testingColab || !draft.colabUrl.trim()}
                onClick={() => void handleTestColab()}
                className="flow-btn-glass flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium disabled:opacity-40 cursor-pointer shrink-0"
              >
                {testingColab ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Test Connection
              </button>
            </div>

            {colabHealth && (
              <div
                className={`flex items-center gap-2 text-[12px] px-3.5 py-2.5 rounded-[12px] border ${colabHealth.online
                  ? 'bg-white/5 border-[#29c58f]/40 text-white'
                  : 'bg-[#b22f25]/20 border-[#fe6e6e]/40 text-[#fe6e6e]'
                  }`}
              >
                {colabHealth.online ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                    <span>
                      Connected: <strong>{colabHealth.gpuName}</strong> ({colabHealth.vramFreeGb}/
                      {colabHealth.vramTotalGb} GB VRAM free)
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-[#fe6e6e] shrink-0" />
                    <span>{colabHealth.error || 'Could not reach Colab tunnel.'}</span>
                  </>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[12px] text-white/60 mb-1.5">Colab Image Model</label>
                <select
                  value={draft.colabModelImage}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      colabModelImage: e.target.value as EngineSettings['colabModelImage'],
                    })
                  }
                  className="flow-input w-full px-3 py-2 text-[13px] cursor-pointer"
                >
                  <option value="sdxl-turbo" className="bg-[#131314]">SDXL-Turbo (~2s per keyframe)</option>
                  <option value="sdxl-base" className="bg-[#131314]">SDXL 1.0 Base (1024px Photorealistic)</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] text-white/60 mb-1.5">Colab Video Model</label>
                <select
                  value={draft.colabModelVideo}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      colabModelVideo: e.target.value as EngineSettings['colabModelVideo'],
                    })
                  }
                  className="flow-input w-full px-3 py-2 text-[13px] cursor-pointer"
                >
                  <option value="wan2.2-5b" className="bg-[#131314]">
                    Wan 2.2 TI2V-5B (Best Free T4 · Apache 2.0 T2V/I2V)
                  </option>
                  <option value="ltx-0.9.7-distilled" className="bg-[#131314]">
                    LTX-Video 0.9.7 Distilled (Fast 8-Step · T2V/I2V/FLF)
                  </option>
                  <option value="wan2.1-1.3b" className="bg-[#131314]">
                    Wan2.1-1.3B (High-Motion Open T2V)
                  </option>
                  <option value="cogvideox-2b" className="bg-[#131314]">
                    CogVideoX-2B (T4 16GB T2V)
                  </option>
                  <option value="ltx-video" className="bg-[#131314]">
                    LTX-Video 0.9.5 Legacy
                  </option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[12px] bg-black/45 border border-white/15 text-[12px] text-white/85 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.colabAudio}
                onChange={(e) => setDraft({ ...draft, colabAudio: e.target.checked })}
                className="accent-white"
              />
              <Volume2 className="w-4 h-4 stroke-[1.6] text-[#29c58f] shrink-0" />
              <span>
                <strong className="font-medium text-white">
                  Generate Synchronized AI Audio on T4 GPU ($0 AudioLDM2 + FFmpeg)
                </strong>{' '}
                — muxes realistic foley &amp; ambient sound directly into the Colab MP4.
              </span>
            </label>
          </div>

          {/* Collapsible Optional Paid BYOK Cloud APIs */}
          <div className="rounded-[16px] border border-white/15 bg-white/[0.02] overflow-hidden">
            <button
              type="button"
              data-testid="toggle-paid-apis-btn"
              onClick={() => setShowPaidApis((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[13px] text-white/80">
                {showPaidApis ? (
                  <ChevronDown className="w-4 h-4 stroke-[1.6] text-white/60" />
                ) : (
                  <ChevronRight className="w-4 h-4 stroke-[1.6] text-white/50" />
                )}
                <span className="font-medium">
                  Optional Paid Cloud APIs (BYOK — Gemini Omni 1.2 &amp; Seedance 2.5)
                </span>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 rounded-[32px] bg-white/8 text-white/55">
                Optional
              </span>
            </button>

            {showPaidApis && (
              <div className="p-4 pt-3 space-y-3 border-t border-white/15">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-testid="select-engine-omni"
                    onClick={() => setDraft({ ...draft, activeEngine: 'gemini-omni' })}
                    className={`text-left p-3 rounded-[14px] border transition cursor-pointer ${draft.activeEngine === 'gemini-omni'
                      ? 'border-white bg-white/10'
                      : 'border-white/15 bg-white/5 hover:border-white/25'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[13px] font-medium text-white flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 stroke-[1.6] text-[#c2e7ff] shrink-0" />
                        Omni 1.2 Flash
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-[32px] bg-white/10 text-white/75 shrink-0">
                        Paid BYOK
                      </span>
                    </div>
                    <p className="text-[11px] text-white/55 mt-1">
                      Requires billed Google AI Studio key (~$0.023–$0.209/s).
                    </p>
                  </button>

                  <button
                    type="button"
                    data-testid="select-engine-seedance"
                    onClick={() => setDraft({ ...draft, activeEngine: 'seedance-byok' })}
                    className={`text-left p-3 rounded-[14px] border transition cursor-pointer ${draft.activeEngine === 'seedance-byok'
                      ? 'border-white bg-white/10'
                      : 'border-white/15 bg-white/5 hover:border-white/25'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[13px] font-medium text-white flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 stroke-[1.6] text-[#9e9eff] shrink-0" />
                        Seedance 2.5
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-[32px] bg-white/10 text-white/75 shrink-0">
                        Paid BYOK
                      </span>
                    </div>
                    <p className="text-[11px] text-white/55 mt-1">
                      Requires funded Replicate / fal.ai balance.
                    </p>
                  </button>
                </div>

                {/* Engine 3 Config: Official Google Gemini Omni 1.2 Flash */}
                <div className="rounded-[14px] border border-white/15 bg-black/40 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 stroke-[1.6] text-[#c2e7ff]" />
                      Google Gemini Omni 1.2 Flash (3s–15s · 360p–4K)
                    </div>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="flow-btn-glass flex items-center gap-1 px-3 py-1 text-[11px]"
                    >
                      Get Google AI Studio Key
                      <ExternalLink className="w-3 h-3 stroke-[1.6]" />
                    </a>
                  </div>

                  {serverKeys.gemini && (
                    <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border border-[#29c58f]/35 bg-white/5 text-white">
                      <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                      <span>Encrypted Server Key active for Google Gemini API.</span>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-3 gap-2.5 items-end">
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">
                        Omni 1.2 Resolution
                      </label>
                      <select
                        data-testid="omni-resolution-select"
                        value={draft.omniResolution}
                        onChange={(e) =>
                          setDraft({ ...draft, omniResolution: e.target.value as OmniResolution })
                        }
                        className="flow-input w-full px-2.5 py-2 text-[12px]"
                      >
                        <option value="360p" className="bg-[#131314]">360p Fast Preview</option>
                        <option value="720p" className="bg-[#131314]">720p HD Default</option>
                        <option value="1080p" className="bg-[#131314]">1080p Full HD</option>
                        <option value="4k" className="bg-[#131314]">4K Ultra HD</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <div className="relative flex-1">
                        <KeyRound className="w-3.5 h-3.5 text-white/45 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          data-testid="omni-apikey-input"
                          autoComplete="off"
                          value={draft.geminiApiKey}
                          onChange={(e) => setDraft({ ...draft, geminiApiKey: e.target.value })}
                          placeholder={
                            serverKeys.gemini
                              ? 'Using server key (paste to override)'
                              : 'AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                          }
                          className="flow-input w-full pl-8 pr-3 py-2 text-[12px] font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        data-testid="omni-verify-btn"
                        disabled={testingOmni || (!draft.geminiApiKey.trim() && !serverKeys.gemini)}
                        onClick={() => void handleTestOmni()}
                        className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium disabled:opacity-40 shrink-0 cursor-pointer"
                      >
                        {testingOmni ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Verify Key
                      </button>
                    </div>
                  </div>

                  {omniStatus && (
                    <div
                      className={`flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border ${omniStatus.valid
                        ? 'bg-white/5 border-[#29c58f]/40 text-white'
                        : 'bg-[#b22f25]/20 border-[#fe6e6e]/40 text-[#fe6e6e]'
                        }`}
                    >
                      {omniStatus.valid ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                          <span>
                            Verified: <strong>{omniStatus.account}</strong> — Gemini Omni 1.2 active!
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-[#fe6e6e] shrink-0" />
                          <span>{omniStatus.error}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Engine 4 Config: Official ByteDance Seedance (BYOK) */}
                <div className="rounded-[14px] border border-white/15 bg-black/40 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 stroke-[1.6] text-[#9e9eff]" />
                      ByteDance Seedance (2.5 / 2.0 BYOK)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <a
                        href="https://replicate.com/account/api-tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="flow-btn-glass flex items-center gap-1 px-2.5 py-1 text-[11px]"
                      >
                        Replicate Key
                        <ExternalLink className="w-3 h-3 stroke-[1.6]" />
                      </a>
                      <a
                        href="https://fal.ai/dashboard/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="flow-btn-glass flex items-center gap-1 px-2.5 py-1 text-[11px]"
                      >
                        fal.ai Key
                        <ExternalLink className="w-3 h-3 stroke-[1.6]" />
                      </a>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">API Provider</label>
                      <select
                        data-testid="seedance-provider-select"
                        value={draft.seedanceProvider}
                        onChange={(e) => handleProviderChange(e.target.value as SeedanceProvider)}
                        className="flow-input w-full px-2.5 py-2 text-[12px]"
                      >
                        <option value="replicate" className="bg-[#131314]">Replicate (Recommended)</option>
                        <option value="fal" className="bg-[#131314]">fal.ai Queue API</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-white/60 mb-1">
                        Seedance Model Version
                      </label>
                      <select
                        data-testid="seedance-model-select"
                        value={draft.seedanceModel}
                        onChange={(e) => setDraft({ ...draft, seedanceModel: e.target.value })}
                        className="flow-input w-full px-2.5 py-2 text-[12px]"
                      >
                        {activeSeedanceModels.map((m) => (
                          <option key={m.id} value={m.id} className="bg-[#131314]">
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-2.5 items-end">
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">
                        Video Resolution
                      </label>
                      <select
                        value={draft.seedanceResolution}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            seedanceResolution: e.target.value as SeedanceResolution,
                          })
                        }
                        className="flow-input w-full px-2.5 py-2 text-[12px]"
                      >
                        <option value="480p" className="bg-[#131314]">480p (Fastest)</option>
                        <option value="720p" className="bg-[#131314]">720p HD (Balanced)</option>
                        <option value="1080p" className="bg-[#131314]">1080p Full HD</option>
                      </select>
                    </div>
                    <label className="sm:col-span-2 flex items-center gap-2 px-3 py-2 rounded-[12px] bg-black/50 border border-white/15 text-[12px] text-white/85 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.seedanceAudio}
                        onChange={(e) => setDraft({ ...draft, seedanceAudio: e.target.checked })}
                        className="accent-white"
                      />
                      <Volume2 className="w-3.5 h-3.5 stroke-[1.6] text-white/75" />
                      <span>Generate Synchronized Native Audio</span>
                    </label>
                  </div>

                  {((draft.seedanceProvider === 'replicate' && serverKeys.replicate) ||
                    (draft.seedanceProvider === 'fal' && serverKeys.fal)) && (
                      <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border border-[#29c58f]/35 bg-white/5 text-white">
                        <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                        <span>
                          Encrypted Server Key active for{' '}
                          <strong>
                            {draft.seedanceProvider === 'replicate' ? 'Replicate' : 'fal.ai'}
                          </strong>
                          .
                        </span>
                      </div>
                    )}

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="w-3.5 h-3.5 text-white/45 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        data-testid="seedance-apikey-input"
                        autoComplete="off"
                        value={draft.seedanceApiKey}
                        onChange={(e) => setDraft({ ...draft, seedanceApiKey: e.target.value })}
                        placeholder={
                          (draft.seedanceProvider === 'replicate' && serverKeys.replicate) ||
                            (draft.seedanceProvider === 'fal' && serverKeys.fal)
                            ? 'Using server key (paste to override)'
                            : draft.seedanceProvider === 'replicate'
                              ? 'r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                              : 'xxxxxxxx-xxxx-xxxx:xxxxxxxxxxxxxxxx'
                        }
                        className="flow-input w-full pl-8 pr-3 py-2 text-[12px] font-mono"
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
                      className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      {testingSeedance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Verify Key
                    </button>
                  </div>

                  {seedanceStatus && (
                    <div
                      className={`flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border ${seedanceStatus.valid
                        ? 'bg-white/5 border-[#29c58f]/40 text-white'
                        : 'bg-[#b22f25]/20 border-[#fe6e6e]/40 text-[#fe6e6e]'
                        }`}
                    >
                      {seedanceStatus.valid ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                          <span>
                            Key Verified: <strong>{seedanceStatus.account}</strong> — Seedance active!
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-[#fe6e6e] shrink-0" />
                          <span>{seedanceStatus.error || 'Key validation failed.'}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/15 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flow-btn-glass px-4 py-2 text-[13px] font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="flow-cta-primary px-5 py-2 text-[13px] cursor-pointer"
          >
            Save Engine Settings
          </button>
        </div>
      </div>
    </div>
  );
}
