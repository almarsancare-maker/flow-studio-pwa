import { useEffect, useMemo, useState } from 'react';
import { FileText, ListVideo, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import type { BibleEntry, GenerationMode, ParsedScriptShot } from '../types/studio';
import { parseScriptShotList } from '../utils/promptCompiler';
import { generateScriptWithDirector } from '../services/director';

interface ScriptImportModalProps {
  open: boolean;
  bibleEntries: BibleEntry[];
  onClose: () => void;
  onImportShots: (shots: ParsedScriptShot[]) => void;
}

const EXAMPLE_SCRIPT = `S1: [16:9] [image] Wide establishing shot of @LOC-D at midnight, tropical rain hitting glass, warm desk lamp glow [sub: "Midnight in Manila — the rain never stops."]
S2: [16:9] [image] Medium close-up of @MIRA sketching quietly inside @LOC-D, shallow depth of field, 35mm cinema still [sub: "One sketch left before sunrise."]
S3: [16:9] [4s] [t2v] Slow push-in on @MIRA looking up from her notebook inside @LOC-D as thunder lights the window [sub: "Then the lights flickered."]`;

export function ScriptImportModal({
  open,
  bibleEntries,
  onClose,
  onImportShots,
}: ScriptImportModalProps) {
  const [rawText, setRawText] = useState('');
  const [premise, setPremise] = useState('');
  const [writing, setWriting] = useState(false);
  const [defaultMode, setDefaultMode] = useState<GenerationMode>('t2i');

  const handleAutoWrite = async () => {
    if (!premise.trim() || writing) return;
    setWriting(true);
    try {
      const tags = bibleEntries.map((b) => b.tag);
      const res = await generateScriptWithDirector(premise.trim(), tags, 4);
      setRawText(res.script);
    } finally {
      setWriting(false);
    }
  };

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
      className="fixed inset-0 z-[1050] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        data-testid="flow-modal-surface"
        className="flow-modal w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-white/15 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-medium text-white flex items-center gap-2 tracking-[-0.01em]">
              <FileText className="w-4 h-4 stroke-[1.6] text-white" />
              Bulk Script / Shot-List Importer
            </h2>
            <p className="text-[12px] text-white/55 mt-1 leading-[18px]">
              Paste multi-scene prompts (<code className="font-mono text-white/80">S1:</code>,{' '}
              <code className="font-mono text-white/80">[16:9]</code>,{' '}
              <code className="font-mono text-white/80">[5s]</code>,{' '}
              <code className="font-mono text-white/80">[t2v]</code>,{' '}
              <code className="font-mono text-white">@TAG</code>) and queue all shots in one batch.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close script importer"
            onClick={onClose}
            className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.6]" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {/* Free ($0) AI Storyboard Script Director */}
          <div className="rounded-[16px] border border-white/15 bg-white/5 p-4 space-y-2.5">
            <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
              <Wand2 className="w-4 h-4 stroke-[1.6]" />
              AI Film Script Director ($0 — Turn 1 Story Idea Into a Full Multi-Shot Script)
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                data-testid="script-premise-input"
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAutoWrite();
                }}
                placeholder="e.g. A young artist discovers a mysterious glowing letter in a rainy Manila dorm..."
                className="flow-input flex-1 px-3 py-2 text-[13px]"
              />
              <button
                type="button"
                data-testid="auto-write-script-btn"
                disabled={!premise.trim() || writing}
                onClick={() => void handleAutoWrite()}
                className="flow-cta-primary flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] disabled:opacity-40 shrink-0 cursor-pointer"
              >
                {writing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 stroke-[1.7]" />
                )}
                Auto-Write Script
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-white/60">Default Mode:</span>
              <select
                aria-label="Default script shot mode"
                value={defaultMode}
                onChange={(e) => setDefaultMode(e.target.value as GenerationMode)}
                className="flow-select-pill px-3 py-1.5 text-[12px] cursor-pointer"
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
              className="flow-btn-glass flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 stroke-[1.6]" />
              Load Example 3-Shot Script
            </button>
          </div>

          <textarea
            rows={6}
            data-testid="script-import-textarea"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your episode shot list here...&#10;S1: [16:9] [image] Establishing shot of @LOC-D&#10;S2: [16:9] [5s] [t2v] @MIRA walks past neon doorway"
            className="flow-input w-full p-3.5 text-[12px] font-mono resize-y"
          />

          {/* Live Parsed Shot Preview Table */}
          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="text-[13px] font-medium text-white flex items-center gap-1.5">
                <ListVideo className="w-4 h-4 stroke-[1.6]" />
                Parsed {parsed.length} {parsed.length === 1 ? 'Shot' : 'Shots'} Ready to Queue
              </div>
              <div className="rounded-[16px] border border-white/15 divide-y divide-white/10 bg-white/[0.03] max-h-52 overflow-y-auto">
                {parsed.map((item, idx) => (
                  <div
                    key={idx}
                    className="px-3.5 py-2.5 flex items-start justify-between gap-3 text-[12px]"
                  >
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-[32px] bg-white/10 text-white font-mono font-medium text-[10px]">
                        {item.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-[32px] bg-white/5 border border-white/15 text-white/75 uppercase text-[10px]">
                        {item.mode}
                      </span>
                      {item.aspectRatio && (
                        <span className="text-[11px] text-white/55">{item.aspectRatio}</span>
                      )}
                      {item.durationSec && (
                        <span className="text-[11px] text-white/55">{item.durationSec}s</span>
                      )}
                    </div>
                    <div className="flex-1 text-white/80 line-clamp-2">{item.prompt}</div>
                    {item.detectedTags.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        {item.detectedTags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded-[32px] bg-white/10 text-white font-mono text-[10px]"
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

        <div className="px-6 py-4 border-t border-white/15 flex items-center justify-between gap-3">
          <span className="text-[12px] text-white/50">
            All detected @TAGs auto-expand from your Bible during generation.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flow-btn-glass px-4 py-2 text-[13px] font-medium cursor-pointer"
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
              className="flow-cta-primary px-5 py-2 text-[13px] disabled:opacity-40 cursor-pointer"
            >
              Queue All {parsed.length} {parsed.length === 1 ? 'Shot' : 'Shots'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
