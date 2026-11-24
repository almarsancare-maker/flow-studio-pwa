import { useRef, useState } from 'react';
import { BookOpen, ImagePlus, Lock, Plus, Trash2, X } from 'lucide-react';
import type { BibleCategory, BibleEntry } from '../types/studio';
import { normalizeTag } from '../utils/promptCompiler';
import { fileToResizedDataUrl } from '../utils/frameGrabber';

interface BibleDrawerProps {
  open: boolean;
  projectId: string;
  entries: BibleEntry[];
  onClose: () => void;
  onSaveEntry: (entry: BibleEntry) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onInsertTag: (tag: string) => void;
}

const CATEGORY_COLORS: Record<BibleCategory, string> = {
  character: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  location: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  prop: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

export function BibleDrawer({
  open,
  projectId,
  entries,
  onClose,
  onSaveEntry,
  onDeleteEntry,
  onInsertTag,
}: BibleDrawerProps) {
  const [tagInput, setTagInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [category, setCategory] = useState<BibleCategory>('character');
  const [descriptor, setDescriptor] = useState('');
  const [lockedSeed, setLockedSeed] = useState('');
  const [refImage, setRefImage] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 768);
      setRefImage(dataUrl);
    } catch {
      // Ignore invalid file
    }
  };

  const handleSave = async () => {
    const normTag = normalizeTag(tagInput);
    if (!normTag || !descriptor.trim()) return;
    setSaving(true);
    try {
      const parsedSeed = lockedSeed.trim() ? Number(lockedSeed.trim()) : undefined;
      const entry: BibleEntry = {
        id: `bible_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId,
        tag: normTag,
        category,
        title: titleInput.trim() || normTag.slice(1),
        descriptor: descriptor.trim(),
        lockedSeed: Number.isFinite(parsedSeed) ? parsedSeed : undefined,
        refImageDataUrl: refImage,
        createdAt: Date.now(),
      };
      await onSaveEntry(entry);
      setTagInput('');
      setTitleInput('');
      setDescriptor('');
      setLockedSeed('');
      setRefImage(undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400" />
              Character &amp; Location Bible
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Fixes Flow Con #1: Type <span className="text-amber-300">@TAG</span> in any prompt to auto-lock appearance, location &amp; seed.
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

        {/* New Entry Form */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/40 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              data-testid="bible-tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="@MIRA or @LOC-D"
              className="px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-amber-200 placeholder:text-zinc-600 focus:border-amber-500/60 outline-none"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BibleCategory)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 outline-none"
            >
              <option value="character">Character</option>
              <option value="location">Location</option>
              <option value="prop">Prop / Wardrobe</option>
              <option value="style">Camera / Style</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              data-testid="bible-title-input"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Display name (e.g. Mira)"
              className="px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 outline-none"
            />
            <input
              type="number"
              value={lockedSeed}
              onChange={(e) => setLockedSeed(e.target.value)}
              placeholder="Locked seed (optional)"
              className="px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 outline-none"
            />
          </div>

          <textarea
            rows={2}
            data-testid="bible-descriptor-input"
            value={descriptor}
            onChange={(e) => setDescriptor(e.target.value)}
            placeholder="Exact locked visual traits: age, hair, outfit, lighting, camera..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 outline-none resize-none"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFileChange(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
              >
                <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                {refImage ? 'Change Ref Still' : 'Ref Still (Optional)'}
              </button>
              {refImage && (
                <img
                  src={refImage}
                  alt="Reference preview"
                  className="w-8 h-8 rounded object-cover border border-zinc-700"
                />
              )}
            </div>

            <button
              type="button"
              data-testid="bible-save-btn"
              disabled={saving || !normalizeTag(tagInput) || !descriptor.trim()}
              onClick={() => void handleSave()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:opacity-40 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Save @TAG
            </button>
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {entries.length === 0 ? (
            <div className="text-center py-10 text-xs text-zinc-500">
              No Bible tags yet. Create <span className="text-amber-300">@MIRA</span> or{' '}
              <span className="text-sky-300">@LOC-D</span> above to stop character drift across scenes.
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.refImageDataUrl && (
                      <img
                        src={entry.refImageDataUrl}
                        alt={entry.title}
                        className="w-10 h-10 rounded-lg object-cover border border-zinc-700 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-amber-300 font-mono">{entry.tag}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                            CATEGORY_COLORS[entry.category]
                          }`}
                        >
                          {entry.category}
                        </span>
                        {entry.lockedSeed !== undefined && (
                          <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" />
                            {entry.lockedSeed}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-300 font-medium truncate">{entry.title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onInsertTag(entry.tag);
                        onClose();
                      }}
                      className="px-2 py-1 text-[11px] font-medium rounded-md bg-amber-400/15 text-amber-200 border border-amber-400/30 hover:bg-amber-400/25"
                    >
                      Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteEntry(entry.id)}
                      title="Delete tag"
                      className="p-1 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{entry.descriptor}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
