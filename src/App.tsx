import { useEffect, useState } from 'react';
import { getVaultUsageBytes, listProjects } from './db/vault';
import type { Project } from './types/studio';
import { compilePromptWithBible, parseScriptShotList } from './utils/promptCompiler';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [vaultMB, setVaultMB] = useState<number>(0);

  useEffect(() => {
    void Promise.all([listProjects(), getVaultUsageBytes()]).then(([list, usage]) => {
      setProjects(list);
      setVaultMB(usage.usedMB);
    });
  }, []);

  const samplePreview = compilePromptWithBible('Ready for Phase 2–3 FlowStudio UI', []);
  const sampleParsed = parseScriptShotList('S1: [16:9] Opening shot');

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6 space-y-3">
        <h1 className="text-xl font-semibold tracking-tight text-amber-300">
          FlowStudio PWA — Core Vault Initialized
        </h1>
        <p className="text-sm text-zinc-400">{samplePreview.compiledPrompt}</p>
        <div className="text-xs text-zinc-500 flex items-center justify-between pt-2 border-t border-zinc-800">
          <span>Projects in IndexedDB: {projects.length}</span>
          <span>Vault: {vaultMB} MB</span>
          <span>Parser OK: {sampleParsed.length}</span>
        </div>
      </div>
    </div>
  );
}
