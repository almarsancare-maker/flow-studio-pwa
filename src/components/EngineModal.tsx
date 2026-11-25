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

type ModalTab = 'hf' | 'colab' | 'pro';

const REPLICATE_MODELS = [
  { id: 'bytedance/seedance-2.5', label: 'Seedance 2.5 (Latest + Audio)' },
  { id: 'bytedance/seedance-2.0', label: 'Seedance 2.0 (Cinema + Audio)' },
  { id: 'bytedance/seedance-1.5-pro', label: 'Seedance 1.5 Pro (Lip-Sync)' },
  { id: 'bytedance/seedance-1-pro', label: 'Seedance 1.0 Pro (Fast)' },
];

const FAL_MODELS = [
  { id: 'bytedance/seedance-2.5/text-to-video', label: 'Seedance 2.5 (Auto T2V/I2V)' },
  { id: 'bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0 (T2V/I2V + Audio)' },
  { id: 'fal-ai/bytedance/seedance/v1/pro/text-to-video', label: 'Seedance 1.0 Pro (Fast)' },
];

function tabForEngine(engine: EngineSettings['activeEngine']): ModalTab {
  if (engine === 'colab-t4') return 'colab';
  if (engine === 'gemini-omni' || engine === 'seedance-byok') return 'pro';
  return 'hf';
}

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
  const [tab, setTab] = useState<ModalTab>(() => tabForEngine(settings.activeEngine));
  const [proChoice, setProChoice] = useState<'gemini-omni' | 'seedance-byok'>('gemini-omni');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const dirtyRef = useRef(false);
  const wasOpenRef = useRef(false);

  const [testingHf, setTestingHf] = useState(false);
  const [hfStatus, setHfStatus] = useState<SeedanceKeyStatus | null>(null);
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
      setTab(tabForEngine(settings.activeEngine));
      if (settings.activeEngine === 'seedance-byok') setProChoice('seedance-byok');
      else setProChoice('gemini-omni');
      setShowAdvanced(false);
      setHfStatus(null);
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

  const handleSelectTab = (nextTab: ModalTab) => {
    setTab(nextTab);
    setShowAdvanced(false);
    if (nextTab === 'hf') {
      setDraft((prev) => ({ ...prev, activeEngine: 'free-24-7' }));
    } else if (nextTab === 'colab') {
      setDraft((prev) => ({ ...prev, activeEngine: 'colab-t4' }));
    } else {
      setDraft((prev) => ({ ...prev, activeEngine: proChoice }));
    }
  };

  const handleTestHf = async () => {
    setTestingHf(true);
    try {
      const result = await verifyHfToken(draft.hfToken);
      setHfStatus(result);
      if (result.valid) {
        const next: EngineSettings = {
          ...draft,
          activeEngine: 'free-24-7',
          hfToken: draft.hfToken.trim(),
        };
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
        const next: EngineSettings = {
          ...draft,
          activeEngine: 'colab-t4',
          colabUrl: draft.colabUrl.trim(),
        };
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
        const next: EngineSettings = {
          ...draft,
          activeEngine: 'gemini-omni',
          geminiApiKey: draft.geminiApiKey.trim(),
        };
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
        const next: EngineSettings = {
          ...draft,
          activeEngine: 'seedance-byok',
          seedanceApiKey: draft.seedanceApiKey.trim(),
        };
        setDraftState(next);
        dirtyRef.current = false;
        await onSaveSettings(next);
      }
    } finally {
      setTestingSeedance(false);
    }
  };

  const handleProviderChange = (provider: SeedanceProvider) => {
    const defaultModel = provider === 'replicate' ? REPLICATE_MODELS[0].id : FAL_MODELS[0].id;
    setDraft((prev) => ({ ...prev, seedanceProvider: provider, seedanceModel: defaultModel }));
    setSeedanceStatus(null);
  };

  const handleSaveAndClose = async () => {
    await onSaveSettings(draft);
    onClose();
  };

  const hfConnected = draft.hfToken.trim().length > 0 && (hfStatus === null || hfStatus.valid);
  const activeSeedanceModels =
    draft.seedanceProvider === 'replicate' ? REPLICATE_MODELS : FAL_MODELS;
  const hasServerSeedance =
    draft.seedanceProvider === 'replicate' ? serverKeys.replicate : serverKeys.fal;

  return (
    <div
      className="fixed inset-0 z-[1050] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        data-testid="flow-modal-surface"
        className="flow-modal w-full max-w-[560px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-medium text-white tracking-[-0.02em]">
              Connect Video GPU
            </h2>
            <p className="text-[12.5px] text-white/55 mt-0.5 leading-[18px]">
              Pick one option below for real AI video. Stills work immediately without setup.
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

        {/* Clean 3-Tab Switcher (One Engine Visible at a Time) */}
        <div className="px-6 pb-4">
          <div className="flow-pill-group grid grid-cols-3 p-1 gap-1">
            <button
              type="button"
              data-testid="select-engine-free"
              onClick={() => handleSelectTab('hf')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-[32px] text-[12.5px] font-medium transition cursor-pointer ${
                tab === 'hf' ? 'bg-white text-[#121317]' : 'text-white/65 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 stroke-[1.7] shrink-0" />
              <span>Free HF Cloud</span>
            </button>

            <button
              type="button"
              data-testid="select-engine-colab"
              onClick={() => handleSelectTab('colab')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-[32px] text-[12.5px] font-medium transition cursor-pointer ${
                tab === 'colab' ? 'bg-white text-[#121317]' : 'text-white/65 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 stroke-[1.7] shrink-0" />
              <span>Free Colab GPU</span>
            </button>

            <button
              type="button"
              data-testid="toggle-paid-apis-btn"
              onClick={() => handleSelectTab('pro')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-[32px] text-[12.5px] font-medium transition cursor-pointer ${
                tab === 'pro' ? 'bg-white text-[#121317]' : 'text-white/65 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 stroke-[1.7] shrink-0" />
              <span>Pro APIs</span>
            </button>
          </div>
        </div>

        {/* Focused Single-Engine Body */}
        <div className="px-6 pb-5 overflow-y-auto space-y-4">
          {/* ═══ TAB 1: FREE HUGGING FACE CLOUD (2 SIMPLE STEPS) ═══ */}
          {tab === 'hf' && (
            <div className="space-y-4">
              {/* Live Status Pill */}
              <div
                className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[14px] border text-[12px] ${
                  hfStatus?.valid || hfConnected
                    ? 'bg-[#29c58f]/10 border-[#29c58f]/35 text-white'
                    : 'bg-white/[0.04] border-white/15 text-white/80'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      hfStatus?.valid || hfConnected ? 'bg-[#29c58f]' : 'bg-[#f59e0b]'
                    }`}
                  />
                  <span className="truncate">
                    {hfStatus?.valid ? (
                      <>
                        Connected as <strong>{hfStatus.account}</strong> — LTX-2.5 22B ready
                      </>
                    ) : hfConnected ? (
                      <>
                        HF Token saved — <strong>LTX-2.5 22B</strong> (Video + Speech + Audio)
                      </>
                    ) : (
                      <>
                        Runs <strong>LTX-2.5 22B</strong> (Video + Audio) · Free, 15s setup
                      </>
                    )}
                  </span>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-[#29c58f] shrink-0">
                  $0 · NO CARD
                </span>
              </div>

              {/* Step 1 */}
              <div className="rounded-[14px] border border-white/15 bg-white/[0.03] p-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 border border-white/15 text-[12px] font-medium text-white flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <div className="text-[13.5px] font-medium text-white">
                      Get your free Hugging Face Read token
                    </div>
                    <p className="text-[12px] text-white/55 mt-0.5">
                      Sign in free → click Create token → copy the <code className="font-mono text-white/80">hf_...</code> key.
                    </p>
                  </div>
                </div>
                <a
                  href="https://huggingface.co/settings/tokens/new?tokenType=read"
                  target="_blank"
                  rel="noreferrer"
                  className="flow-btn-glass inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium shrink-0"
                >
                  Get Token
                  <ExternalLink className="w-3.5 h-3.5 stroke-[1.6]" />
                </a>
              </div>

              {/* Step 2 */}
              <div className="rounded-[14px] border border-white/15 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 border border-white/15 text-[12px] font-medium text-white flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="text-[13.5px] font-medium text-white">
                    Paste token &amp; connect
                  </div>
                </div>

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
                      className="flow-input w-full pl-9 pr-3 py-2.5 text-[13px] font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    data-testid="hf-verify-btn"
                    disabled={testingHf || !draft.hfToken.trim()}
                    onClick={() => void handleTestHf()}
                    className="flow-cta-primary flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    {testingHf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Connect
                  </button>
                </div>

                {hfStatus && !hfStatus.valid && (
                  <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] bg-[#b22f25]/20 border border-[#fe6e6e]/40 text-[#fe6e6e]">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{hfStatus.error}</span>
                  </div>
                )}
              </div>

              {/* Collapsed Advanced Options */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white transition cursor-pointer"
                >
                  {showAdvanced ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>Advanced model &amp; audio options</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 rounded-[14px] border border-white/15 bg-black/40 p-3.5 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11.5px] text-white/60 mb-1">
                          Keyframe Image Model
                        </label>
                        <select
                          data-testid="free-image-model-select"
                          value={draft.freeImageModel}
                          onChange={(e) =>
                            setDraft({ ...draft, freeImageModel: e.target.value as FreeImageModel })
                          }
                          className="flow-input w-full px-3 py-2 text-[12px] cursor-pointer"
                        >
                          <option value="flux" className="bg-[#131314]">FLUX.1-schnell (Default)</option>
                          <option value="flux-dev" className="bg-[#131314]">FLUX.1-dev Pro</option>
                          <option value="sd35-turbo" className="bg-[#131314]">SD 3.5 Large Turbo</option>
                          <option value="turbo" className="bg-[#131314]">Pollinations Turbo (No Token)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11.5px] text-white/60 mb-1">
                          Video Engine Mode
                        </label>
                        <select
                          value={draft.freeVideoFallback}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              freeVideoFallback: e.target.value as 'hf-ltx-space' | 'ken-burns-local',
                            })
                          }
                          className="flow-input w-full px-3 py-2 text-[12px] cursor-pointer"
                        >
                          <option value="hf-ltx-space" className="bg-[#131314]">
                            LTX-2.5 22B + Wan 2.2 14B
                          </option>
                          <option value="ken-burns-local" className="bg-[#131314]">
                            Still Pan/Zoom Only (No AI Video)
                          </option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-[12px] text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        data-testid="free-auto-audio-toggle"
                        checked={draft.freeAutoAudio}
                        onChange={(e) => setDraft({ ...draft, freeAutoAudio: e.target.checked })}
                        className="accent-white"
                      />
                      <Volume2 className="w-3.5 h-3.5 text-[#29c58f] shrink-0" />
                      <span>Add MMAudio Foley on silent fallback clips (LTX-2.5 already has native audio)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TAB 2: FREE GOOGLE COLAB T4 GPU (3 SIMPLE STEPS) ═══ */}
          {tab === 'colab' && (
            <div className="space-y-4">
              {/* Live Status Pill */}
              <div
                className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-[14px] border text-[12px] ${
                  colabHealth?.online
                    ? 'bg-[#29c58f]/10 border-[#29c58f]/35 text-white'
                    : 'bg-white/[0.04] border-white/15 text-white/80'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      colabHealth?.online ? 'bg-[#29c58f]' : 'bg-[#f59e0b]'
                    }`}
                  />
                  <span className="truncate">
                    {colabHealth?.online ? (
                      <>
                        Connected: <strong>{colabHealth.gpuName}</strong> ({colabHealth.vramFreeGb}/
                        {colabHealth.vramTotalGb} GB VRAM)
                      </>
                    ) : (
                      <>
                        Runs <strong>CogVideoX-2B &amp; LTX-Video 2B</strong> on Google&apos;s free 16 GB T4 · Zero-OOM
                      </>
                    )}
                  </span>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-[#29c58f] shrink-0">
                  $0 · NO QUOTA
                </span>
              </div>

              {/* Step 1 & 2 Combined Card */}
              <div className="rounded-[14px] border border-white/15 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/10 border border-white/15 text-[12px] font-medium text-white flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <div className="text-[13.5px] font-medium text-white">
                        Open the ready-made Colab GPU notebook
                      </div>
                      <p className="text-[12px] text-white/55 mt-0.5">
                        Click <strong className="text-white/85">Runtime → Run all</strong> (~60s) and copy the printed <code className="font-mono text-white/80">trycloudflare.com</code> link.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href="https://colab.research.google.com/github/almarsancare-maker/flow-studio-pwa/blob/main/colab/FlowStudio_Colab_T4_Backend.ipynb"
                      target="_blank"
                      rel="noreferrer"
                      className="flow-btn-glass inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
                    >
                      Open Colab
                      <ExternalLink className="w-3.5 h-3.5 stroke-[1.6]" />
                    </a>
                    <a
                      href="/FlowStudio_Colab_T4_Backend.ipynb"
                      download="FlowStudio_Colab_T4_Backend.ipynb"
                      title="Download .ipynb notebook"
                      className="flow-btn-glass p-2"
                    >
                      <Download className="w-3.5 h-3.5 stroke-[1.6]" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Step 2: Paste & Connect */}
              <div className="rounded-[14px] border border-white/15 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-white/10 border border-white/15 text-[12px] font-medium text-white flex items-center justify-center shrink-0">
                    2
                  </span>
                  <div className="text-[13.5px] font-medium text-white">
                    Paste your tunnel link &amp; connect
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={draft.colabUrl}
                    onChange={(e) => setDraft({ ...draft, colabUrl: e.target.value })}
                    placeholder="https://your-slug.trycloudflare.com"
                    className="flow-input flex-1 px-3 py-2.5 text-[13px] font-mono"
                  />
                  <button
                    type="button"
                    disabled={testingColab || !draft.colabUrl.trim()}
                    onClick={() => void handleTestColab()}
                    className="flow-cta-primary flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    {testingColab ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Connect
                  </button>
                </div>

                {colabHealth && !colabHealth.online && (
                  <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] bg-[#b22f25]/20 border border-[#fe6e6e]/40 text-[#fe6e6e]">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{colabHealth.error || 'Could not reach Colab tunnel.'}</span>
                  </div>
                )}
              </div>

              {/* Collapsed Advanced Colab Options */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-white/55 hover:text-white transition cursor-pointer"
                >
                  {showAdvanced ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  <span>Advanced Colab model options</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 rounded-[14px] border border-white/15 bg-black/40 p-3.5 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11.5px] text-white/60 mb-1">
                          Colab Video Model
                        </label>
                        <select
                          value={draft.colabModelVideo}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              colabModelVideo: e.target.value as EngineSettings['colabModelVideo'],
                            })
                          }
                          className="flow-input w-full px-3 py-2 text-[12px] cursor-pointer"
                        >
                          <option value="cogvideox-2b" className="bg-[#131314]">CogVideoX-2B (Fastest T4 Native FP16 · Default)</option>
                          <option value="ltx-video" className="bg-[#131314]">LTX-Video 0.9.5 2B (24fps · T2V/I2V/FLF)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11.5px] text-white/60 mb-1">
                          Colab Image Model
                        </label>
                        <select
                          value={draft.colabModelImage}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              colabModelImage: e.target.value as EngineSettings['colabModelImage'],
                            })
                          }
                          className="flow-input w-full px-3 py-2 text-[12px] cursor-pointer"
                        >
                          <option value="sdxl-turbo" className="bg-[#131314]">SDXL-Turbo (Fast)</option>
                          <option value="sdxl-base" className="bg-[#131314]">SDXL 1.0 Base (1024px)</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-[12px] text-white/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draft.colabAudio}
                        onChange={(e) => setDraft({ ...draft, colabAudio: e.target.checked })}
                        className="accent-white"
                      />
                      <Volume2 className="w-3.5 h-3.5 text-[#29c58f] shrink-0" />
                      <span>Generate synchronized AI foley audio on T4 (AudioLDM2 + FFmpeg)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TAB 3: OPTIONAL PAID PRO APIS (OMNI 1.2 / SEEDANCE 2.5) ═══ */}
          {tab === 'pro' && (
            <div className="space-y-4">
              {/* Sub-choice: Omni 1.2 vs Seedance 2.5 */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  data-testid="select-engine-omni"
                  onClick={() => {
                    setProChoice('gemini-omni');
                    setDraft((prev) => ({ ...prev, activeEngine: 'gemini-omni' }));
                  }}
                  className={`text-left p-3 rounded-[14px] border transition cursor-pointer ${
                    proChoice === 'gemini-omni'
                      ? 'border-white bg-white/10'
                      : 'border-white/15 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#c2e7ff]" />
                    Gemini Omni 1.2
                  </div>
                  <div className="text-[11px] text-white/55 mt-0.5">Google AI Studio key · 4K + Audio</div>
                </button>

                <button
                  type="button"
                  data-testid="select-engine-seedance"
                  onClick={() => {
                    setProChoice('seedance-byok');
                    setDraft((prev) => ({ ...prev, activeEngine: 'seedance-byok' }));
                  }}
                  className={`text-left p-3 rounded-[14px] border transition cursor-pointer ${
                    proChoice === 'seedance-byok'
                      ? 'border-white bg-white/10'
                      : 'border-white/15 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-[#9e9eff]" />
                    Seedance 2.5
                  </div>
                  <div className="text-[11px] text-white/55 mt-0.5">Replicate / fal.ai key</div>
                </button>
              </div>

              {proChoice === 'gemini-omni' ? (
                <div className="rounded-[14px] border border-white/15 bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-white">Google AI Studio Key</span>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="flow-btn-glass inline-flex items-center gap-1 px-2.5 py-1 text-[11px]"
                    >
                      Get Key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {serverKeys.gemini && (
                    <div className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border border-[#29c58f]/35 bg-[#29c58f]/10 text-white">
                      <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                      <span>Server key active for Gemini Omni 1.2.</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      data-testid="omni-resolution-select"
                      value={draft.omniResolution}
                      onChange={(e) =>
                        setDraft({ ...draft, omniResolution: e.target.value as OmniResolution })
                      }
                      className="flow-input px-2.5 py-2.5 text-[12px] shrink-0 cursor-pointer"
                    >
                      <option value="360p" className="bg-[#131314]">360p</option>
                      <option value="720p" className="bg-[#131314]">720p</option>
                      <option value="1080p" className="bg-[#131314]">1080p</option>
                      <option value="4k" className="bg-[#131314]">4K</option>
                    </select>
                    <input
                      type="password"
                      data-testid="omni-apikey-input"
                      autoComplete="off"
                      value={draft.geminiApiKey}
                      onChange={(e) => setDraft({ ...draft, geminiApiKey: e.target.value })}
                      placeholder="AIzaSyxxxxxxxxxxxxxxxxxxxxxxx"
                      className="flow-input flex-1 px-3 py-2.5 text-[12.5px] font-mono min-w-0"
                    />
                    <button
                      type="button"
                      data-testid="omni-verify-btn"
                      disabled={testingOmni || (!draft.geminiApiKey.trim() && !serverKeys.gemini)}
                      onClick={() => void handleTestOmni()}
                      className="flow-cta-primary flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      {testingOmni ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Connect
                    </button>
                  </div>

                  {omniStatus && (
                    <div
                      className={`flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border ${
                        omniStatus.valid
                          ? 'bg-[#29c58f]/10 border-[#29c58f]/40 text-white'
                          : 'bg-[#b22f25]/20 border-[#fe6e6e]/40 text-[#fe6e6e]'
                      }`}
                    >
                      {omniStatus.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#fe6e6e] shrink-0" />
                      )}
                      <span>
                        {omniStatus.valid
                          ? `Connected: ${omniStatus.account}`
                          : omniStatus.error}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[14px] border border-white/15 bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-white">Seedance API Key</span>
                    <div className="flex items-center gap-1.5">
                      <a
                        href="https://replicate.com/account/api-tokens"
                        target="_blank"
                        rel="noreferrer"
                        className="flow-btn-glass inline-flex items-center gap-1 px-2.5 py-1 text-[11px]"
                      >
                        Replicate <ExternalLink className="w-3 h-3" />
                      </a>
                      <a
                        href="https://fal.ai/dashboard/keys"
                        target="_blank"
                        rel="noreferrer"
                        className="flow-btn-glass inline-flex items-center gap-1 px-2.5 py-1 text-[11px]"
                      >
                        fal.ai <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <select
                      data-testid="seedance-provider-select"
                      value={draft.seedanceProvider}
                      onChange={(e) => handleProviderChange(e.target.value as SeedanceProvider)}
                      className="flow-input px-2.5 py-2 text-[12px] cursor-pointer"
                    >
                      <option value="replicate" className="bg-[#131314]">Replicate</option>
                      <option value="fal" className="bg-[#131314]">fal.ai</option>
                    </select>
                    <select
                      data-testid="seedance-model-select"
                      value={draft.seedanceModel}
                      onChange={(e) => setDraft({ ...draft, seedanceModel: e.target.value })}
                      className="flow-input col-span-2 px-2.5 py-2 text-[12px] cursor-pointer"
                    >
                      {activeSeedanceModels.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#131314]">
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={draft.seedanceResolution}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          seedanceResolution: e.target.value as SeedanceResolution,
                        })
                      }
                      className="flow-input px-2.5 py-2.5 text-[12px] shrink-0 cursor-pointer"
                    >
                      <option value="480p" className="bg-[#131314]">480p</option>
                      <option value="720p" className="bg-[#131314]">720p</option>
                      <option value="1080p" className="bg-[#131314]">1080p</option>
                    </select>
                    <input
                      type="password"
                      data-testid="seedance-apikey-input"
                      autoComplete="off"
                      value={draft.seedanceApiKey}
                      onChange={(e) => setDraft({ ...draft, seedanceApiKey: e.target.value })}
                      placeholder={
                        hasServerSeedance
                          ? 'Server key active (optional override)'
                          : draft.seedanceProvider === 'replicate'
                          ? 'r8_xxxxxxxxxxxxxxxxxxxxxxx'
                          : 'key_id:key_secret'
                      }
                      className="flow-input flex-1 px-3 py-2.5 text-[12.5px] font-mono min-w-0"
                    />
                    <button
                      type="button"
                      data-testid="seedance-verify-btn"
                      disabled={
                        testingSeedance || (!draft.seedanceApiKey.trim() && !hasServerSeedance)
                      }
                      onClick={() => void handleTestSeedance()}
                      className="flow-cta-primary flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      {testingSeedance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Connect
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-[12px] text-white/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.seedanceAudio}
                      onChange={(e) => setDraft({ ...draft, seedanceAudio: e.target.checked })}
                      className="accent-white"
                    />
                    <Volume2 className="w-3.5 h-3.5 text-white/75" />
                    <span>Native synchronized audio</span>
                  </label>

                  {seedanceStatus && (
                    <div
                      className={`flex items-center gap-2 text-[12px] px-3 py-2 rounded-[10px] border ${
                        seedanceStatus.valid
                          ? 'bg-[#29c58f]/10 border-[#29c58f]/40 text-white'
                          : 'bg-[#b22f25]/20 border-[#fe6e6e]/40 text-[#fe6e6e]'
                      }`}
                    >
                      {seedanceStatus.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-[#29c58f] shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#fe6e6e] shrink-0" />
                      )}
                      <span>
                        {seedanceStatus.valid
                          ? `Connected: ${seedanceStatus.account}`
                          : seedanceStatus.error || 'Key validation failed.'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clean Single-Action Footer */}
        <div className="px-6 py-3.5 border-t border-white/15 flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-white/50">
            Active:{' '}
            <strong className="font-medium text-white/85">
              {draft.activeEngine === 'colab-t4'
                ? 'Free Colab GPU'
                : draft.activeEngine === 'gemini-omni'
                ? 'Gemini Omni 1.2'
                : draft.activeEngine === 'seedance-byok'
                ? 'Seedance 2.5'
                : 'Free HF Cloud'}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => void handleSaveAndClose()}
            className="flow-btn-glass px-4 py-2 text-[12.5px] font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
