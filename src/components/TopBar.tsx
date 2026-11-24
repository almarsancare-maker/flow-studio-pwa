import { useState } from 'react';
import {
  BookOpen,
  Cpu,
  Download,
  FileText,
  Film,
  FolderPlus,
  HardDrive,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { EngineSettings, Project } from '../types/studio';
import type { ColabHealthStatus, ServerKeyCapabilities } from '../services/engine';

interface TopBarProps {
  projects: Project[];
  activeProject: Project | null;
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
}

export function TopBar({
  projects,
  activeProject,
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
}: TopBarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateProject(trimmed);
    setNewName('');
    setCreating(false);
  };

  const isColabActive = engineSettings.activeEngine === 'colab-t4';
  const isSeedanceActive = engineSettings.activeEngine === 'seedance-byok';
  const colabConnected = isColabActive && colabHealth?.online;
  const hasServerSeedance =
    engineSettings.seedanceProvider === 'replicate' ? serverKeys.replicate : serverKeys.fal;
  const seedanceHasKey =
    isSeedanceActive && (engineSettings.seedanceApiKey.trim().length > 0 || hasServerSeedance);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 flow-glass">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
        {/* Left: Brand + Project Switcher */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
              <Film className="w-4 h-4 text-zinc-950" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-xs sm:text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-1.5 whitespace-nowrap">
                <span>Cabardo Studio</span>
                <span className="hidden lg:inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                  FREE LIFETIME
                </span>
              </div>
              <div className="hidden sm:block text-[10px] text-zinc-500 whitespace-nowrap">
                AI Generator
              </div>
            </div>
          </div>

          <div className="h-5 w-px bg-zinc-800 hidden sm:block shrink-0" />

          {creating ? (
            <div className="flex items-center gap-1.5 min-w-0">
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
                className="w-28 sm:w-44 px-2.5 py-1 text-xs rounded-lg bg-zinc-900 border border-amber-500/50 text-zinc-100 outline-none"
              />
              <button
                type="button"
                onClick={handleCreate}
                className="px-2 py-1 text-xs font-medium rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 shrink-0"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-1.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 shrink-0"
              >
                ×
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 min-w-0">
              <select
                aria-label="Active project"
                value={activeProject?.id ?? ''}
                onChange={(e) => onSelectProject(e.target.value)}
                className="max-w-[140px] md:max-w-[175px] lg:max-w-[220px] truncate px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-900/90 border border-zinc-800 text-zinc-200 hover:border-zinc-700 outline-none cursor-pointer"
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
                className="p-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-amber-300 hover:border-zinc-700 transition shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Action Pills (All whitespace-nowrap + shrink-0 so Tablet/Mobile NEVER wrap or collide) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Fix #1: Character & Location Bible */}
          <button
            type="button"
            onClick={onOpenBible}
            data-testid="open-bible-btn"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900/90 border border-zinc-800 text-zinc-200 hover:border-amber-500/50 hover:text-amber-200 transition whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden md:inline">Bible</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/15 text-amber-300">
              {bibleCount}
            </span>
          </button>

          {/* Fix #7: Bulk Script Importer */}
          <button
            type="button"
            onClick={onOpenScriptImport}
            data-testid="open-script-import-btn"
            title="Import Multi-Scene Script / Shot List"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900/90 border border-zinc-800 text-zinc-200 hover:border-zinc-600 transition whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="hidden lg:inline">Import Script</span>
          </button>

          {/* Fix #6: 3-Engine Compute Switcher */}
          <button
            type="button"
            onClick={onOpenEngine}
            data-testid="open-engine-btn"
            title="Switch Compute Engine (Free Cloud / Colab T4 / Seedance 2.5)"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition whitespace-nowrap shrink-0 ${
              seedanceHasKey
                ? 'bg-violet-500/20 border-violet-400/50 text-violet-200'
                : colabConnected
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : isColabActive || isSeedanceActive
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-200 hover:border-zinc-600'
            }`}
          >
            {isSeedanceActive ? (
              <Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            ) : isColabActive ? (
              <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {seedanceHasKey
                ? 'Seedance 2.5'
                : isSeedanceActive
                ? 'Seedance (Key)'
                : colabConnected
                ? `Colab T4 (${colabHealth.vramFreeGb ?? '15'}GB)`
                : isColabActive
                ? 'Colab T4'
                : 'Free 24/7 Cloud'}
            </span>
          </button>

          {/* Fix #5: Local Vault Usage + Portable Export */}
          <button
            type="button"
            onClick={onExportProjectJson}
            title={`Local IndexedDB Vault (${vaultMB} MB used) — Click to export portable Project JSON`}
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 bg-zinc-900/70 border border-zinc-800/80 hover:text-zinc-200 hover:border-zinc-700 transition whitespace-nowrap shrink-0"
          >
            <HardDrive className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span>{vaultMB} MB</span>
            <Download className="w-3 h-3 ml-0.5 text-zinc-500 shrink-0" />
          </button>

          {canInstallPwa && (
            <button
              type="button"
              onClick={onInstallPwa}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-400 text-zinc-950 hover:bg-amber-300 transition whitespace-nowrap shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Install App</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
