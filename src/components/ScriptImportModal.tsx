import { useEffect, useMemo, useState } from 'react';
import { FileText, ListVideo, Sparkles, X } from 'lucide-react';
import type { GenerationMode, ParsedScriptShot } from '../types/studio';
import { parseScriptShotList } from '../utils/promptCompiler';

interface ScriptImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportShots: (shots: ParsedScriptShot[]) => void;
}

const EXAMPLE_SCRIPT = `S1: [16:9] [image] Wide establishing shot of @LOC-D at midnight, tropical rain hitting glass, warm desk lamp glow
S2: [16:9] [image] Medium close-up of @MIRA sketching quietly inside @LOC-D, shallow depth of field, 35mm cinema still
S3: [16:9] [4s] [t2v] Slow push-in on @MIRA looking up from her notebook inside @LOC-D as thunder lights the window`;

export function ScriptImportModal({ open, onClose, onImportShots }: ScriptImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [defaultMode, setDefaultMode] = useState<GenerationMode>('t2i');

  const parsed = useMemo(
    () => parseScriptShotList(rawText, defaultMode),
    [rawText, defaultMode]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] rounded-2xl border border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-400" />
              Bulk Script / Shot-List Importer
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fixes Flow Con #7: Paste multi-scene prompts (<code className="text-zinc-300">S1:</code>,{' '}
              <code className="text-zinc-300">SH02 -</code>, <code className="text-zinc-300">[16:9]</code>,{' '}
              <code className="text-zinc-300">[5s]</code>, <code className="text-zinc-300">[t2v]</code>,{' '}
              <code className="text-amber-300">@TAG</code>) and queue all at once.
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

        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">Default Mode:</span>
              <select
                value={defaultMode}
                onChange={(e) => setDefaultMode(e.target.value as GenerationMode)}
                className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 outline-none"
              >
                <option value="t2i">Keyframe Still (Recommended Stage 1)</option>
                <option value="t2v">Text to Video</option>
                <option value="i2v">Frames to Video</option>
              </select>
            </div>
            <button
              type="button"
              data-testid="load-example-script-btn"
              onClick={() => setRawText(EXAMPLE_SCRIPT)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-sky-300 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20"
            >
              <Sparkles className="w-3 h-3" />
              Load Example 3-Shot Script
            </button>
          </div>

          <textarea
            rows={6}
            data-testid="script-import-textarea"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your episode shot list here...&#10;S1: [16:9] [image] Establishing shot of @LOC-D&#10;S2: [16:9] [5s] [t2v] @MIRA walks past neon doorway"
            className="w-full p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/50 outline-none resize-y"
          />

          {/* Live Parsed Shot Preview Table */}
          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <ListVideo className="w-3.5 h-3.5 text-amber-400" />
                Parsed {parsed.length} {parsed.length === 1 ? 'Shot' : 'Shots'} Ready to Queue
              </div>
              <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800/80 bg-zinc-900/40 max-h-52 overflow-y-auto">
                {parsed.map((item, idx) => (
                  <div key={idx} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono font-bold text-[10px]">
                        {item.label}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 uppercase text-[10px]">
                        {item.mode}
                      </span>
                      {item.aspectRatio && (
                        <span className="text-[10px] text-zinc-400">{item.aspectRatio}</span>
                      )}
                      {item.durationSec && (
                        <span className="text-[10px] text-zinc-400">{item.durationSec}s</span>
                      )}
                    </div>
                    <div className="flex-1 text-zinc-300 line-clamp-2">{item.prompt}</div>
                    {item.detectedTags.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        {item.detectedTags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 font-mono text-[10px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-zinc-800 flex items-center justify-between bg-zinc-950">
          <span className="text-xs text-zinc-500">
            All detected @TAGs auto-expand from your Bible during generation.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="script-queue-all-btn"
              disabled={parsed.length === 0}
              onClick={() => {
                onImportShots(parsed);
                setRawText('');
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
            >
              Queue All {parsed.length} {parsed.length === 1 ? 'Shot' : 'Shots'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
