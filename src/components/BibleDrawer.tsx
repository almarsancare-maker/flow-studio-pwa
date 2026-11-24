import { useEffect, useRef, useState } from 'react';
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

const CATEGORY_LABELS: Record<BibleCategory, string> = {
  character: 'Character',
  location: 'Location',
  prop: 'Prop',
  style: 'Style',
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
    <div
      className="fixed inset-0 z-[1050] flex justify-end bg-black/75 backdrop-blur-md"
      onClick={onClose}
    >
      <aside
        data-testid="flow-modal-surface"
        aria-label="Character and Location Bible"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-[#131314] border-l border-white/15 flex flex-col shadow-[0_25px_50px_-12px_rgba(0,0,0,0.9)]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/15 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-medium text-white flex items-center gap-2 tracking-[-0.01em]">
              <BookOpen className="w-4 h-4 stroke-[1.6] text-white" />
              Character &amp; Location Bible
            </h2>
            <p className="text-[12px] text-white/55 mt-1 leading-[18px]">
              Type <span className="font-mono text-white">@TAG</span> in any prompt to lock
              identity, wardrobe, environment, and seed across scenes.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Bible drawer"
            onClick={onClose}
            className="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.6]" />
          </button>
        </div>

        {/* New Entry Form */}
        <div className="p-5 border-b border-white/15 bg-white/[0.03] space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              data-testid="bible-tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="@MIRA or @LOC-D"
              className="flow-input px-3 py-2 text-[13px] font-mono"
            />
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as BibleCategory)}
              className="flow-input px-3 py-2 text-[13px] cursor-pointer"
            >
              <option value="character" className="bg-[#131314]">Character</option>
              <option value="location" className="bg-[#131314]">Location</option>
              <option value="prop" className="bg-[#131314]">Prop / Wardrobe</option>
              <option value="style" className="bg-[#131314]">Camera / Style</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              data-testid="bible-title-input"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Display name (e.g. Mira)"
              className="flow-input px-3 py-2 text-[13px]"
            />
            <input
              type="number"
              value={lockedSeed}
              onChange={(e) => setLockedSeed(e.target.value)}
              placeholder="Locked seed (optional)"
              className="flow-input px-3 py-2 text-[13px] font-mono"
            />
          </div>

          <textarea
            rows={2}
            data-testid="bible-descriptor-input"
            value={descriptor}
            onChange={(e) => setDescriptor(e.target.value)}
            placeholder="Exact locked visual traits: age, hair, outfit, lighting, camera..."
            className="flow-input w-full px-3 py-2 text-[13px] resize-none"
          />

          <div className="flex items-center justify-between gap-2 pt-0.5">
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
                className="flow-btn-glass flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5 stroke-[1.6]" />
                {refImage ? 'Change Ref' : 'Ref Still'}
              </button>
              {refImage && (
                <img
                  src={refImage}
                  alt="Reference preview"
                  className="w-8 h-8 rounded-lg object-cover border border-white/20"
                />
              )}
            </div>

            <button
              type="button"
              data-testid="bible-save-btn"
              disabled={saving || !normalizeTag(tagInput) || !descriptor.trim()}
              onClick={() => void handleSave()}
              className="flow-cta-primary flex items-center gap-1.5 px-4 py-2 text-[13px] disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2]" />
              Save @TAG
            </button>
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {entries.length === 0 ? (
            <div className="text-center py-10 text-[13px] text-white/50">
              No Bible tags yet. Create <span className="font-mono text-white">@MIRA</span> or{' '}
              <span className="font-mono text-white">@LOC-D</span> above to lock continuity across
              scenes.
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="flow-card p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {entry.refImageDataUrl && (
                      <img
                        src={entry.refImageDataUrl}
                        alt={entry.title}
                        className="w-10 h-10 rounded-lg object-cover border border-white/15 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-white font-mono">
                          {entry.tag}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-[32px] bg-white/10 border border-white/15 text-white/75 uppercase">
                          {CATEGORY_LABELS[entry.category]}
                        </span>
                        {entry.lockedSeed !== undefined && (
                          <span className="text-[11px] text-white/55 font-mono flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5 stroke-[1.6]" />
                            {entry.lockedSeed}
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-white/80 font-medium truncate mt-0.5">
                        {entry.title}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onInsertTag(entry.tag);
                        onClose();
                      }}
                      className="flow-btn-glass px-2.5 py-1 text-[11px] font-medium cursor-pointer"
                    >
                      Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteEntry(entry.id)}
                      title="Delete tag"
                      aria-label={`Delete ${entry.tag}`}
                      className="p-1.5 rounded-full text-white/45 hover:text-[#fe6e6e] hover:bg-white/10 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[1.6]" />
                    </button>
                  </div>
                </div>
                <p className="text-[12px] text-white/60 leading-[18px]">{entry.descriptor}</p>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
