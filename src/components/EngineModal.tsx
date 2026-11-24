import { useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import type { EngineSettings } from '../types/studio';
import { pingColabBackend, type ColabHealthStatus } from '../services/engine';

interface EngineModalProps {
  open: boolean;
  settings: EngineSettings;
  colabHealth: ColabHealthStatus | null;
  onClose: () => void;
  onSaveSettings: (next: EngineSettings) => Promise<void>;
  onHealthUpdate: (status: ColabHealthStatus) => void;
}

export function EngineModal({
  open,
  settings,
  colabHealth,
  onClose,
  onSaveSettings,
  onHealthUpdate,
}: EngineModalProps) {
  const [draft, setDraft] = useState<EngineSettings>(settings);
  const [testing, setTesting] = useState(false);

  if (!open) return null;

  const handleTestColab = async () => {
    setTesting(true);
    try {
      const result = await pingColabBackend(draft.colabUrl);
      onHealthUpdate(result);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    await onSaveSettings(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Dual $0 Compute Engine (No Subscriptions, No API Keys)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fixes Flow Con #6: Draft infinitely at $0 on Cloud 24/7, then switch to your Free Google Colab T4 16 GB GPU for open-source cinema video.
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
          {/* Engine Mode Cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, activeEngine: 'free-24-7' })}
              className={`text-left p-3.5 rounded-xl border transition ${
                draft.activeEngine === 'free-24-7'
                  ? 'border-amber-400/60 bg-amber-500/10'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Engine 1: Free 24/7 Cloud
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                  $0 Always-On
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                Instant keyframes via Pollinations FLUX + Hugging Face FLUX.1-schnell ZeroGPU, plus HF LTX-Video / instant browser motion pass.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDraft({ ...draft, activeEngine: 'colab-t4' })}
              className={`text-left p-3.5 rounded-xl border transition ${
                draft.activeEngine === 'colab-t4'
                  ? 'border-emerald-400/60 bg-emerald-500/10'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  Engine 2: Free Colab T4 16 GB
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                  $0 Dedicated GPU
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                Your single-account Google Colab NVIDIA T4 running SDXL, CogVideoX-2B, LTX-Video (T2V &amp; I2V), or Wan2.1 via free Cloudflare Tunnel.
              </p>
            </button>
          </div>

          {/* Engine 1 Config */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-zinc-200">Engine 1: Free 24/7 Cloud Options</div>
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
                  <option value="flux">FLUX (Cinematic Quality + HF ZeroGPU Failover)</option>
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
                  <option value="hf-ltx-space">Try HF LTX-Video ZeroGPU → Fallback Motion</option>
                  <option value="ken-burns-local">Instant 2-Stage Keyframe + Cinema Motion</option>
                </select>
              </div>
            </div>
          </div>

          {/* Engine 2 Config (Colab T4 Bridge) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-200">
                Engine 2: Google Colab T4 16 GB Tunnel Setup
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
              <li>Download the notebook above and upload it to Google Colab (Runtime → T4 GPU).</li>
              <li>Run <strong className="text-zinc-200">Step 1</strong>, <strong className="text-zinc-200">Step 2</strong>, and <strong className="text-zinc-200">Step 5</strong> (FastAPI + free Cloudflare Tunnel).</li>
              <li>Paste the printed <code className="text-emerald-300">https://*.trycloudflare.com</code> URL below and click Test.</li>
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
                disabled={testing || !draft.colabUrl.trim()}
                onClick={() => void handleTestColab()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
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
