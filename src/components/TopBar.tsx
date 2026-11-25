import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Clapperboard,
  Cpu,
  Download,
  FileText,
  Film,
  FolderPlus,
  HardDrive,
  MoreVertical,
  Smartphone,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { EngineSettings, Project, WorkspaceView } from '../types/studio';
import type { ColabHealthStatus, ServerKeyCapabilities } from '../services/engine';

interface TopBarProps {
  projects: Project[];
  activeProject: Project | null;
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  engineSettings: EngineSettings;
  colabHealth: ColabHealthStatus | null;
  serverKeys: ServerKeyCapabilities;
  bibleCount: number;
  vaultMB: number;
  canInstallPwa: boolean;
  onInstallPwa: () => void;
  onOpenBible: () => void;
  onOpenScriptImport: () => void;
  onOpenEngine: () => void;
  onExportProjectJson: () => void;
  onImportProjectJson: (rawJson: string) => void;
}

export function TopBar({
  projects,
  activeProject,
  activeView,
  onChangeView,
  onSelectProject,
  onCreateProject,
  engineSettings,
  colabHealth,
  serverKeys,
  bibleCount,
  vaultMB,
  canInstallPwa,
  onInstallPwa,
  onOpenBible,
  onOpenScriptImport,
  onOpenEngine,
  onExportProjectJson,
  onImportProjectJson,
}: TopBarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [menuOpen]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateProject(trimmed);
    setNewName('');
    setCreating(false);
    setMenuOpen(false);
  };

  const isColabActive = engineSettings.activeEngine === 'colab-t4';
  const isOmniActive = engineSettings.activeEngine === 'gemini-omni';
  const isSeedanceActive = engineSettings.activeEngine === 'seedance-byok';
  const colabConnected = isColabActive && colabHealth?.online;
  const hfTokenReady =
    engineSettings.activeEngine === 'free-24-7' && engineSettings.hfToken.trim().length > 0;
  const omniHasKey =
    isOmniActive && (engineSettings.geminiApiKey.trim().length > 0 || serverKeys.gemini);
  const hasServerSeedance =
    engineSettings.seedanceProvider === 'replicate' ? serverKeys.replicate : serverKeys.fal;
  const seedanceHasKey =
    isSeedanceActive && (engineSettings.seedanceApiKey.trim().length > 0 || hasServerSeedance);

  const engineLabel = omniHasKey
    ? `Omni 1.2 (${engineSettings.omniResolution})`
    : isOmniActive
    ? 'Omni 1.2 (No Key)'
    : seedanceHasKey
    ? 'Seedance 2.5'
    : isSeedanceActive
    ? 'Seedance (No Key)'
    : colabConnected
    ? `Colab T4 (${colabHealth.vramFreeGb ?? '15'}GB)`
    : isColabActive
    ? 'Colab T4 (Offline)'
    : hfTokenReady
    ? 'HF ZeroGPU'
    : 'Setup Video GPU';

  const statusDotColor = omniHasKey
    ? 'bg-[#c2e7ff]'
    : seedanceHasKey
    ? 'bg-[#9e9eff]'
    : colabConnected || hfTokenReady
    ? 'bg-[#29c58f]'
    : 'bg-[#f59e0b]';

  return (
    <header
      data-testid="flow-top-bar"
      className="flow-header sticky top-0 w-full shrink-0 !h-auto md:!h-[80px]"
    >
      <nav
        data-testid="flow-main-nav"
        aria-label="Main navigation"
        className="w-full h-[64px] md:h-full px-4 sm:px-6 md:px-8 lg:px-10 flex items-center justify-between gap-3 sm:gap-4"
      >
        {/* Left: Pure Flow Wordmark + Project Selector */}
        <div className="flex items-center gap-4 min-w-0 shrink-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-white shrink-0"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M10 9.5l5 2.5-5 2.5v-5z" fill="currentColor" stroke="none" />
            </svg>
            <span className="text-[19px] sm:text-[21px] font-medium tracking-[-0.025em] text-white whitespace-nowrap leading-none">
              Cabardo Studio
            </span>
          </div>

          <div className="hidden xl:block h-4 w-px bg-white/15 shrink-0" />

          {creating ? (
            <div className="hidden sm:flex items-center gap-1.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder="Project name..."
                autoFocus
                className="flow-input w-40 px-3 py-1.5 text-[13px]"
              />
              <button
                type="button"
                onClick={handleCreate}
                className="flow-cta-primary px-3 py-1.5 text-[12px] cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                aria-label="Cancel new project"
                onClick={() => setCreating(false)}
                className="p-1.5 text-white/50 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[1.5]" />
              </button>
            </div>
          ) : (
            <div className="hidden xl:flex items-center gap-1.5">
              <select
                aria-label="Active project"
                value={activeProject?.id ?? ''}
                onChange={(e) => onSelectProject(e.target.value)}
                className="flow-select-pill max-w-[190px] truncate px-3.5 py-1.5 text-[13px] font-medium cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreating(true)}
                title="New Project"
                aria-label="New Project"
                className="flow-btn-glass w-8 h-8 flex items-center justify-center cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 stroke-[1.5]" />
              </button>
            </div>
          )}
        </div>

        {/* Center: Signature Flow Minimalist Navigation Links (Desktop) */}
        <div className="hidden md:flex items-center justify-center gap-6 lg:gap-7 shrink-0">
          <button
            type="button"
            data-testid="nav-studio-btn"
            data-active={activeView === 'studio' ? 'true' : 'false'}
            onClick={() => {
              onChangeView('studio');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flow-nav-link whitespace-nowrap cursor-pointer"
          >
            Studio
          </button>
          <button
            type="button"
            data-testid="nav-director-btn"
            data-active={activeView === 'director' ? 'true' : 'false'}
            onClick={() => {
              onChangeView('director');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flow-nav-link flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Director</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#c2e7ff]/15 text-[#c2e7ff] border border-[#c2e7ff]/30 font-mono font-medium">
              v5
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenBible}
            data-testid="open-bible-btn"
            className="flow-nav-link flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Bible</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/90 font-normal">
              {bibleCount}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenScriptImport}
            data-testid="open-script-import-btn"
            className="flow-nav-link whitespace-nowrap cursor-pointer"
          >
            Import Script
          </button>
          <button
            type="button"
            onClick={onExportProjectJson}
            title={`Local IndexedDB Vault (${vaultMB} MB used) — Export Project JSON`}
            className="flow-nav-link hidden lg:inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Vault</span>
            <span className="text-[11px] text-white/70">{vaultMB} MB</span>
          </button>
        </div>

        {/* Right: Compute Engine Glass Pill + Overflow Menu (exact Flow right chrome) */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then((txt) => onImportProjectJson(txt));
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={onOpenEngine}
            data-testid="open-engine-btn"
            title="Switch Compute Engine (Free Cloud / Colab T4 / Gemini Omni 1.2 / Seedance 2.5)"
            className="flow-btn-glass h-10 px-3.5 sm:px-4 flex items-center gap-2 text-[13px] font-medium whitespace-nowrap cursor-pointer"
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
            {isOmniActive ? (
              <Sparkles className="w-3.5 h-3.5 stroke-[1.6] text-white shrink-0" />
            ) : isSeedanceActive ? (
              <Zap className="w-3.5 h-3.5 stroke-[1.6] text-white shrink-0" />
            ) : isColabActive ? (
              <Cpu className="w-3.5 h-3.5 stroke-[1.6] text-white shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 stroke-[1.6] text-white shrink-0" />
            )}
            <span className="hidden sm:inline">{engineLabel}</span>
          </button>

          {canInstallPwa && (
            <button
              type="button"
              onClick={onInstallPwa}
              className="flow-cta-primary hidden sm:inline-flex items-center gap-1.5 h-10 px-4 text-[13px] whitespace-nowrap cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 stroke-[1.6]" />
              <span>Install</span>
            </button>
          )}

          {/* Overflow / Mobile Menu Button (exact Flow 3-dot icon chrome) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              data-testid="header-overflow-btn"
              aria-label="Workspace menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#e3e3e3] hover:bg-white/10 transition cursor-pointer"
            >
              <MoreVertical className="w-[18px] h-[18px] stroke-[1.75]" />
            </button>

            {menuOpen && (
              <div
                data-testid="flow-modal-surface"
                className="flow-modal absolute right-0 mt-2 w-64 p-3 space-y-2.5 z-[1050]"
              >
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-white/50 px-1">
                    Project Workspace
                  </div>
                  <select
                    aria-label="Switch project"
                    value={activeProject?.id ?? ''}
                    onChange={(e) => {
                      onSelectProject(e.target.value);
                      setMenuOpen(false);
                    }}
                    className="flow-input w-full px-3 py-2 text-[13px]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-[#131314]">
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                      }}
                      placeholder="New project name..."
                      className="flow-input flex-1 min-w-0 px-2.5 py-1.5 text-[12px]"
                    />
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!newName.trim()}
                      className="flow-cta-primary px-3 py-1.5 text-[12px] disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/15 pt-2 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onChangeView('studio');
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[13px] text-white/85 hover:bg-white/8 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Film className="w-4 h-4 stroke-[1.5] text-white/75" />
                      Studio Canvas
                    </span>
                    {activeView === 'studio' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onChangeView('director');
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[13px] text-white/85 hover:bg-white/8 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 stroke-[1.5] text-[#c2e7ff]" />
                      Director v5 Compiler
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#c2e7ff]/15 text-[#c2e7ff] font-mono">
                      v5.0.3
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenBible();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[13px] text-white/85 hover:bg-white/8 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 stroke-[1.5] text-white/75" />
                      Character Bible
                    </span>
                    <span className="text-[11px] text-white/50">{bibleCount}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenScriptImport();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-white/85 hover:bg-white/8 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 stroke-[1.5] text-white/75" />
                    Import Multi-Shot Script
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onExportProjectJson();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[13px] text-white/85 hover:bg-white/8 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Download className="w-4 h-4 stroke-[1.5] text-white/75" />
                      Export Backup JSON
                    </span>
                    <span className="text-[11px] text-white/50">{vaultMB} MB</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      importFileRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-white/85 hover:bg-white/8 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4 stroke-[1.5] text-white/75" />
                    Import Backup JSON
                  </button>
                  {canInstallPwa && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onInstallPwa();
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] text-white hover:bg-white/10 transition cursor-pointer"
                    >
                      <Smartphone className="w-4 h-4 stroke-[1.5]" />
                      Install Desktop / Mobile App
                    </button>
                  )}
                </div>

                <div className="border-t border-white/15 pt-2 px-2 flex items-center justify-between text-[11px] text-white/50">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 stroke-[1.5]" />
                    Offline IndexedDB Vault
                  </span>
                  <span>{vaultMB} MB</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Primary View Strip (zero-overflow 1-tap Studio <-> Director v5 switch on phones) */}
      <div
        data-testid="mobile-view-strip"
        className="md:hidden w-full px-4 pb-2.5 pt-0.5 bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between gap-2"
      >
        <div className="flow-pill-group grid grid-cols-2 p-1 gap-1 flex-1">
          <button
            type="button"
            data-testid="mobile-nav-studio-btn"
            onClick={() => onChangeView('studio')}
            className={`py-1.5 px-3 rounded-[32px] text-[12.5px] font-medium transition cursor-pointer ${
              activeView === 'studio'
                ? 'bg-white text-[#121317]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Studio
          </button>
          <button
            type="button"
            data-testid="mobile-nav-director-btn"
            onClick={() => onChangeView('director')}
            className={`py-1.5 px-3 rounded-[32px] text-[12.5px] font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeView === 'director'
                ? 'bg-white text-[#121317]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <span>Director</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                activeView === 'director'
                  ? 'bg-[#121317]/15 text-[#121317]'
                  : 'bg-[#c2e7ff]/15 text-[#c2e7ff]'
              }`}
            >
              v5
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenBible}
          className="flow-btn-glass px-3 py-1.5 text-[12px] font-medium shrink-0 flex items-center gap-1 cursor-pointer"
        >
          <span>Bible</span>
          <span className="text-[10px] text-white/60">{bibleCount}</span>
        </button>
      </div>
    </header>
  );
}
