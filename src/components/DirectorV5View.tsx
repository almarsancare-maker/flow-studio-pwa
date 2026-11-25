import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookPlus,
  Check,
  CheckCircle2,
  Clapperboard,
  Copy,
  ExternalLink,
  FileImage,
  Film,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import type {
  BibleEntry,
  DirectorAssetLedgerItem,
  DirectorAssetStatus,
  DirectorPromptBlock,
  DirectorV5Message,
  DirectorV5Session,
  EngineSettings,
  MediaShot,
} from '../types/studio';
import type { ServerKeyCapabilities } from '../services/engine';
import {
  DEFAULT_DIRECTOR_STATE,
  inferLedgerMetaFromFilename,
  initDirectorV5Session,
  mergeLedgerUpdates,
  sendDirectorV5Turn,
} from '../services/directorV5';
import { fileToResizedDataUrl } from '../utils/frameGrabber';

interface DirectorV5ViewProps {
  projectId: string;
  sessions: DirectorV5Session[];
  activeSessionId: string;
  shots: MediaShot[];
  blobUrls: Record<string, string>;
  bible: BibleEntry[];
  engineSettings: EngineSettings;
  serverKeys: ServerKeyCapabilities;
  onSelectSession: (id: string) => void;
  onSaveSession: (session: DirectorV5Session) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onDispatchPromptBlock: (
    sessionId: string,
    block: DirectorPromptBlock,
    takeCount?: 1 | 4
  ) => Promise<void>;
  onPickQuartetWinner: (
    sessionId: string,
    block: DirectorPromptBlock,
    winnerShot: MediaShot
  ) => Promise<void>;
  onRetryShot: (shot: MediaShot) => void;
  onSaveGeminiKey: (apiKey: string) => Promise<void>;
  onSyncLedgerToBible: (items: DirectorAssetLedgerItem[]) => Promise<void>;
  onOpenLightbox: (shot: MediaShot) => void;
  onOpenStudio: () => void;
  onOpenEngine: () => void;
  onShowToast: (msg: string) => void;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function statusPillClasses(status: DirectorAssetStatus): string {
  if (status === 'REF BOUND') {
    return 'bg-[#29c58f]/15 text-[#29c58f] border-[#29c58f]/40';
  }
  if (status === 'APPROVED') {
    return 'bg-[#c2e7ff]/15 text-[#c2e7ff] border-[#c2e7ff]/35';
  }
  return 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/35';
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'queue_a_char':
      return 'QUEUE A · 2×4 CHAR SHEET';
    case 'queue_a_set':
      return 'QUEUE A · 2×2 SET SHEET';
    case 'queue_a_angles':
      return 'QUEUE A · 8-VIEW ANGLES';
    case 'queue_a_blueprint':
      return 'QUEUE A · SET BLUEPRINT';
    case 'queue_a_prop':
      return 'QUEUE A · PROP 8-GRID';
    case 'quartet':
      return 'FRAME QUARTET';
    case 'still_frame':
      return 'PASS 1 STILL';
    case 'queue_b_video':
      return 'QUEUE B · VIDEO';
    case 'motion':
      return 'I2V MOTION';
    case 'last_frame':
      return 'PASS 2 LAST FRAME';
    case 'execution':
      return 'EXECUTION CMD';
    default:
      return 'PROMPT';
  }
}

/**
 * Strips fenced blocks that are already rendered as rich Prompt Cards, Acceptance Cards,
 * or the trailing numbered menu so the conversation reads cleanly without raw duplication.
 */
function cleanAssistantDisplayText(msg: DirectorV5Message): string {
  let out = msg.content || '';
  const blocksToStrip = new Set<string>();
  for (const blk of msg.promptBlocks || []) {
    if (blk.generationKind !== 'meta' || blk.category === 'acceptance_card') {
      blocksToStrip.add(blk.rawBlock.trim());
    }
  }

  out = out.replace(/```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)```/g, (full, inner: string) => {
    const trimmed = inner.trim();
    if (blocksToStrip.has(trimmed)) return '';
    if (/^Acceptance Card:/i.test(trimmed)) return '';
    // Strip trailing fenced numbered menu when interactive buttons render below
    if (
      (msg.options?.length ?? 0) >= 2 &&
      /^\s*1\)\s+/m.test(trimmed) &&
      /^\s*2\)\s+/m.test(trimmed) &&
      trimmed.split('\n').length <= 18
    ) {
      // Keep STEP 0 / O-V / SWEEP header line above buttons if present
      const header = trimmed
        .split('\n')
        .filter((l) => !/^\s*\d{1,2}[.)]\s+/.test(l))
        .join('\n')
        .trim();
      return header ? `${header}\n` : '';
    }
    return full;
  });

  // Also strip plain un-fenced trailing numbered menu if buttons are displayed
  if ((msg.options?.length ?? 0) >= 2) {
    const lines = out.split('\n');
    let cutIdx = lines.length;
    let foundMenuLines = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (!t && foundMenuLines === 0) {
        cutIdx = i;
        continue;
      }
      if (/^\d{1,2}[.)]\s+/.test(t)) {
        foundMenuLines += 1;
        cutIdx = i;
      } else if (foundMenuLines > 0) {
        break;
      } else {
        break;
      }
    }
    if (foundMenuLines >= 2) {
      out = lines.slice(0, cutIdx).join('\n');
    }
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function renderInlineFormatting(line: string): ReactNode[] {
  const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={i} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-white/10 text-[#c2e7ff] font-mono text-[11.5px]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return tok;
  });
}

function LightweightMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const segments = text.split(/(```[a-zA-Z0-9_-]*\r?\n[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-[13.5px] leading-[21px] text-white/85 break-words">
      {segments.map((seg, sIdx) => {
        const fence = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)```$/.exec(seg);
        if (fence) {
          return (
            <pre
              key={sIdx}
              className="p-3 rounded-[12px] bg-black/60 border border-white/15 font-mono text-[11.5px] leading-[18px] text-white/85 overflow-x-auto whitespace-pre-wrap break-words"
            >
              {fence[1].trim()}
            </pre>
          );
        }

        const lines = seg.split('\n');
        return (
          <div key={sIdx} className="space-y-1.5">
            {lines.map((rawLine, lIdx) => {
              const line = rawLine.trim();
              if (!line || line === '---') {
                return line === '---' ? (
                  <hr key={lIdx} className="border-white/10 my-2" />
                ) : null;
              }
              if (line.startsWith('## ')) {
                return (
                  <h3
                    key={lIdx}
                    className="text-[15px] font-semibold text-white tracking-[-0.015em] pt-1"
                  >
                    {renderInlineFormatting(line.slice(3))}
                  </h3>
                );
              }
              if (line.startsWith('### ')) {
                return (
                  <h4 key={lIdx} className="text-[13.5px] font-semibold text-[#c2e7ff] pt-1">
                    {renderInlineFormatting(line.slice(4))}
                  </h4>
                );
              }
              if (line.startsWith('[DEFAULT APPLIED:')) {
                return (
                  <div
                    key={lIdx}
                    className="text-[11.5px] font-mono px-2.5 py-1 rounded-[8px] bg-white/[0.04] border border-white/10 text-white/75"
                  >
                    {line}
                  </div>
                );
              }
              if (line.startsWith('> ')) {
                return (
                  <div
                    key={lIdx}
                    className="pl-3 border-l-2 border-[#c2e7ff]/40 text-[12.5px] text-white/70"
                  >
                    {renderInlineFormatting(line.slice(2))}
                  </div>
                );
              }
              if (/^[-*•]\s+/.test(line)) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="text-white/40 mt-0.5 shrink-0">•</span>
                    <span className="min-w-0 flex-1">
                      {renderInlineFormatting(line.replace(/^[-*•]\s+/, ''))}
                    </span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInlineFormatting(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function DirectorV5View({
  projectId,
  sessions,
  activeSessionId,
  shots,
  blobUrls,
  bible,
  engineSettings,
  serverKeys,
  onSelectSession,
  onSaveSession,
  onDeleteSession,
  onDispatchPromptBlock,
  onPickQuartetWinner,
  onRetryShot,
  onSaveGeminiKey,
  onSyncLedgerToBible,
  onOpenLightbox,
  onOpenStudio,
  onOpenEngine,
  onShowToast,
}: DirectorV5ViewProps) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | DirectorAssetStatus>('ALL');
  const [mobileLedgerOpen, setMobileLedgerOpen] = useState(false);
  const [manualFilename, setManualFilename] = useState('');
  const [bindingShotForId, setBindingShotForId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [geminiBarOpen, setGeminiBarOpen] = useState(false);
  const [geminiDraft, setGeminiDraft] = useState(engineSettings.geminiApiKey);

  useEffect(() => {
    setGeminiDraft(engineSettings.geminiApiKey);
  }, [engineSettings.geminiApiKey]);

  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const singleSlotUploadRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadItemRef = useRef<DirectorAssetLedgerItem | null>(null);
  const autoInitProjectRef = useRef<string>('');

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0] ?? null,
    [sessions, activeSessionId]
  );

  const geminiAvailable =
    engineSettings.geminiApiKey.trim().length > 0 || serverKeys.gemini;

  const shotById = useMemo(() => {
    const map = new Map<string, MediaShot>();
    for (const s of shots) map.set(s.id, s);
    return map;
  }, [shots]);

  const completedShots = useMemo(
    () => shots.filter((s) => s.status === 'completed'),
    [shots]
  );

  const ledgerByFilename = useMemo(() => {
    const map = new Map<string, DirectorAssetLedgerItem>();
    for (const item of activeSession?.ledger ?? []) {
      map.set(item.filename.toLowerCase(), item);
    }
    return map;
  }, [activeSession]);

  const createNewSession = async () => {
    if (!projectId) return;
    setInitializing(true);
    setErrorBanner(null);
    try {
      const res = await initDirectorV5Session(engineSettings.geminiApiKey);
      const now = Date.now();
      const firstMsg: DirectorV5Message = {
        id: makeId('dmsg'),
        role: 'assistant',
        content: res.text,
        provider: res.provider,
        providerTier: res.providerTier,
        usingServerKey: res.usingServerKey,
        stepBadge: res.stepBadge,
        stage: res.stage,
        options: res.options,
        promptBlocks: res.promptBlocks,
        acceptanceCard: res.acceptanceCard,
        checksStamp: res.checksStamp,
        createdAt: now,
      };
      const newSession: DirectorV5Session = {
        id: makeId('dir'),
        projectId,
        title: `Director Session ${sessions.length + 1}`,
        state: res.sessionState || { ...DEFAULT_DIRECTOR_STATE },
        messages: [firstMsg],
        ledger: [],
        dispatchedJobs: {},
        createdAt: now,
        updatedAt: now,
      };
      await onSaveSession(newSession);
      onSelectSession(newSession.id);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not initialize Director v5');
    } finally {
      setInitializing(false);
    }
  };

  // Auto-create initial STEP 0 session when project has none yet
  useEffect(() => {
    if (!projectId) return;
    if (sessions.length > 0) return;
    if (initializing || autoInitProjectRef.current === projectId) return;
    autoInitProjectRef.current = projectId;
    void createNewSession();
  }, [projectId, sessions.length, initializing]);

  // Auto-scroll to latest turn
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeSession?.messages.length, sending]);

  const handleSend = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean || !activeSession || sending) return;
    setErrorBanner(null);
    setSending(true);

    const now = Date.now();
    const userMsg: DirectorV5Message = {
      id: makeId('umsg'),
      role: 'user',
      content: clean,
      createdAt: now,
    };

    // Derive a clean session title from first substantive user input (> 12 chars)
    const shouldRetitle =
      activeSession.title.startsWith('Director Session') && clean.length > 12;
    const optimisticSession: DirectorV5Session = {
      ...activeSession,
      title: shouldRetitle ? clean.slice(0, 42) + (clean.length > 42 ? '…' : '') : activeSession.title,
      messages: [...activeSession.messages, userMsg],
      updatedAt: now,
    };
    await onSaveSession(optimisticSession);
    setInputText('');

    try {
      const history = activeSession.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await sendDirectorV5Turn({
        userInput: clean,
        history,
        ledger: optimisticSession.ledger,
        bible,
        sessionState: optimisticSession.state,
        geminiApiKey: engineSettings.geminiApiKey,
      });

      const assistantMsg: DirectorV5Message = {
        id: makeId('amsg'),
        role: 'assistant',
        content: res.text,
        provider: res.provider,
        providerTier: res.providerTier,
        usingServerKey: res.usingServerKey,
        warning: res.warning ?? null,
        cooldownSec: res.cooldownSec ?? null,
        stepBadge: res.stepBadge,
        stage: res.stage,
        options: res.options,
        promptBlocks: res.promptBlocks,
        acceptanceCard: res.acceptanceCard,
        checksStamp: res.checksStamp,
        createdAt: Date.now(),
      };

      const nextLedger = mergeLedgerUpdates(optimisticSession.ledger, res.ledgerUpdates || []);
      const finalSession: DirectorV5Session = {
        ...optimisticSession,
        state: res.sessionState || optimisticSession.state,
        messages: [...optimisticSession.messages, assistantMsg],
        ledger: nextLedger,
        updatedAt: Date.now(),
      };
      await onSaveSession(finalSession);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Director v5 request failed');
    } finally {
      setSending(false);
    }
  };

  const handleCopyPrompt = async (block: DirectorPromptBlock) => {
    try {
      await navigator.clipboard.writeText(block.copyText);
      setCopiedId(block.id);
      onShowToast(`Copied ${block.assetFilename || block.title} for Google Flow!`);
      window.setTimeout(() => setCopiedId((prev) => (prev === block.id ? null : prev)), 2200);
    } catch {
      onShowToast('Clipboard blocked by browser — select text manually to copy.');
    }
  };

  const handleUploadFilesToLedger = async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeSession) return;
    const updates: Array<{
      filename: string;
      token: string;
      role: string;
      status: DirectorAssetStatus;
      previewDataUrl: string;
    }> = [];

    for (const file of Array.from(files).slice(0, 8)) {
      const preview = await fileToResizedDataUrl(file, 768);
      const safeName = file.name.trim().replace(/\s+/g, '_').toLowerCase();
      const meta = inferLedgerMetaFromFilename(safeName);
      updates.push({
        filename: safeName,
        token: meta.token,
        role: meta.role,
        status: 'REF BOUND',
        previewDataUrl: preview,
      });
    }

    const nextLedger = mergeLedgerUpdates(activeSession.ledger, updates, true);
    await onSaveSession({
      ...activeSession,
      ledger: nextLedger,
      updatedAt: Date.now(),
    });
    onShowToast(
      `Bound ${updates.length} ${updates.length === 1 ? 'file' : 'files'} as REF BOUND (Never-Regenerate locked)`
    );
  };

  const handleUploadSingleSlot = async (file: File | undefined) => {
    const slot = pendingUploadItemRef.current;
    pendingUploadItemRef.current = null;
    if (!file || !slot || !activeSession) return;
    const preview = await fileToResizedDataUrl(file, 768);
    const nextLedger = mergeLedgerUpdates(
      activeSession.ledger,
      [
        {
          filename: slot.filename,
          token: slot.token,
          role: slot.role,
          status: 'REF BOUND',
          previewDataUrl: preview,
        },
      ],
      true
    );
    await onSaveSession({ ...activeSession, ledger: nextLedger, updatedAt: Date.now() });
    onShowToast(`Bound uploaded image to ${slot.filename} as REF BOUND`);
  };

  const handleBindManualFilename = async () => {
    if (!activeSession) return;
    const clean = manualFilename.trim().replace(/\s+/g, '_');
    if (!clean) return;
    const meta = inferLedgerMetaFromFilename(clean);
    const nextLedger = mergeLedgerUpdates(
      activeSession.ledger,
      [{ filename: clean, token: meta.token, role: meta.role, status: 'REF BOUND' }],
      true
    );
    await onSaveSession({ ...activeSession, ledger: nextLedger, updatedAt: Date.now() });
    setManualFilename('');
    onShowToast(`Locked ${clean} as REF BOUND in Asset Inventory Ledger`);
  };

  const handleToggleLedgerStatus = async (item: DirectorAssetLedgerItem) => {
    if (!activeSession) return;
    const nextStatus: DirectorAssetStatus =
      item.status === 'PENDING'
        ? 'APPROVED'
        : item.status === 'APPROVED'
          ? 'REF BOUND'
          : 'PENDING';
    const nextLedger = mergeLedgerUpdates(
      activeSession.ledger,
      [{ filename: item.filename, status: nextStatus }],
      true
    );
    await onSaveSession({ ...activeSession, ledger: nextLedger, updatedAt: Date.now() });
  };

  const handleRemoveLedgerItem = async (id: string) => {
    if (!activeSession) return;
    await onSaveSession({
      ...activeSession,
      ledger: activeSession.ledger.filter((x) => x.id !== id),
      updatedAt: Date.now(),
    });
  };

  const handleBindStudioShotToLedger = async (
    item: DirectorAssetLedgerItem,
    shot: MediaShot
  ) => {
    if (!activeSession) return;
    const preview = shot.thumbnailDataUrl || (shot.blobKey ? blobUrls[shot.blobKey] : undefined);
    const nextLedger = mergeLedgerUpdates(
      activeSession.ledger,
      [
        {
          filename: item.filename,
          token: item.token,
          role: item.role,
          status: 'REF BOUND',
          linkedShotId: shot.id,
          previewDataUrl: preview?.startsWith('data:') ? preview : item.previewDataUrl,
        },
      ],
      true
    );
    await onSaveSession({ ...activeSession, ledger: nextLedger, updatedAt: Date.now() });
    setBindingShotForId(null);
    onShowToast(`Bound Studio ${shot.label} → ${item.filename} (REF BOUND)`);
  };

  const lastAssistant = useMemo(() => {
    const msgs = activeSession?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i];
    }
    return null;
  }, [activeSession]);

  const ledgerCounts = useMemo(() => {
    const list = activeSession?.ledger ?? [];
    return {
      total: list.length,
      refBound: list.filter((i) => i.status === 'REF BOUND').length,
      approved: list.filter((i) => i.status === 'APPROVED').length,
      pending: list.filter((i) => i.status === 'PENDING').length,
    };
  }, [activeSession]);

  const filteredLedger = useMemo(() => {
    const list = activeSession?.ledger ?? [];
    if (ledgerFilter === 'ALL') return list;
    return list.filter((i) => i.status === ledgerFilter);
  }, [activeSession, ledgerFilter]);

  const ledgerPanelBody = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3.5 border-b border-white/15 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-white">
            <Layers className="w-4 h-4 text-[#c2e7ff] shrink-0" />
            <span className="truncate">Asset Inventory Ledger</span>
          </div>
          <p className="text-[11px] text-white/50 mt-0.5">
            v5.0.3 §2.0 / §9.7 · Locked files never regenerate
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileLedgerOpen(false)}
          aria-label="Close ledger drawer"
          className="lg:hidden p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Pills */}
      <div className="px-3 py-2.5 border-b border-white/10 flex flex-wrap items-center gap-1.5">
        {(
          [
            { id: 'ALL', label: `All (${ledgerCounts.total})` },
            { id: 'REF BOUND', label: `REF (${ledgerCounts.refBound})` },
            { id: 'APPROVED', label: `OK (${ledgerCounts.approved})` },
            { id: 'PENDING', label: `Pending (${ledgerCounts.pending})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setLedgerFilter(tab.id)}
            className={`px-2.5 py-1 rounded-[32px] text-[11px] font-medium transition cursor-pointer ${
              ledgerFilter === tab.id
                ? 'bg-white text-[#121317]'
                : 'bg-white/5 text-white/65 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Quick Bind Existing File */}
      <div className="p-3 border-b border-white/10 space-y-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={manualFilename}
            onChange={(e) => setManualFilename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleBindManualFilename();
            }}
            placeholder="e.g. mara_w1_sheet.jpg"
            className="flow-input flex-1 min-w-0 px-2.5 py-1.5 text-[12px] font-mono"
          />
          <button
            type="button"
            disabled={!manualFilename.trim()}
            onClick={() => void handleBindManualFilename()}
            className="flow-cta-primary px-3 py-1.5 text-[11.5px] disabled:opacity-40 cursor-pointer shrink-0"
          >
            Bind
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className="flow-btn-glass flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload REF Image(s)</span>
          </button>
          {ledgerCounts.refBound + ledgerCounts.approved > 0 && (
            <button
              type="button"
              onClick={() => void onSyncLedgerToBible(activeSession?.ledger ?? [])}
              title="Sync bound assets into FlowStudio Character & Location Bible"
              className="flow-btn-glass flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-medium cursor-pointer shrink-0"
            >
              <BookPlus className="w-3.5 h-3.5 text-[#c2e7ff]" />
              <span>→ Bible</span>
            </button>
          )}
        </div>
      </div>

      {/* Ledger Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5" data-testid="director-ledger-list">
        {filteredLedger.length === 0 ? (
          <div className="py-10 px-3 text-center text-[12px] text-white/45 space-y-1.5">
            <FileImage className="w-6 h-6 mx-auto text-white/30" />
            <p>No assets in this view yet.</p>
            <p className="text-[11px] text-white/35">
              Upload existing sheets/frames or click <strong>Generate in Studio</strong> on any
              Director prompt card to auto-bind assets here.
            </p>
          </div>
        ) : (
          filteredLedger.map((item) => {
            const linkedShot = item.linkedShotId ? shotById.get(item.linkedShotId) : undefined;
            const thumbUrl =
              item.previewDataUrl ||
              (linkedShot?.blobKey ? blobUrls[linkedShot.blobKey] : undefined) ||
              linkedShot?.thumbnailDataUrl;

            return (
              <div
                key={item.id}
                data-testid={`ledger-item-${item.filename}`}
                className="rounded-[14px] border border-white/15 bg-white/[0.03] p-2.5 space-y-2"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    onClick={() => {
                      if (linkedShot && linkedShot.status === 'completed') {
                        onOpenLightbox(linkedShot);
                      }
                    }}
                    className={`w-12 h-12 rounded-[10px] bg-black/70 border border-white/15 overflow-hidden shrink-0 flex items-center justify-center ${
                      linkedShot?.status === 'completed' ? 'cursor-pointer' : ''
                    }`}
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-white/35" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-[12px] font-mono font-medium text-white truncate"
                        title={item.filename}
                      >
                        {item.filename}
                      </span>
                      <span
                        className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${statusPillClasses(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-white/55 truncate mt-0.5">
                      <span className="font-mono text-white/75">{item.token}</span> · {item.role}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          pendingUploadItemRef.current = item;
                          singleSlotUploadRef.current?.click();
                        }}
                        className="px-2 py-0.5 rounded-full bg-white/8 hover:bg-white/15 text-[10.5px] text-white/80 transition cursor-pointer"
                      >
                        Upload
                      </button>
                      {completedShots.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setBindingShotForId((prev) => (prev === item.id ? null : item.id))
                          }
                          className="px-2 py-0.5 rounded-full bg-white/8 hover:bg-white/15 text-[10.5px] text-[#c2e7ff] transition cursor-pointer"
                        >
                          From Studio
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleToggleLedgerStatus(item)}
                        title="Cycle status (PENDING -> APPROVED -> REF BOUND)"
                        className="p-1 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      >
                        {item.status === 'PENDING' ? (
                          <Unlock className="w-3 h-3" />
                        ) : (
                          <Lock className="w-3 h-3 text-[#29c58f]" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveLedgerItem(item.id)}
                        title="Remove from ledger"
                        className="p-1 rounded-full text-white/40 hover:text-[#fe6e6e] hover:bg-white/10 transition cursor-pointer ml-auto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {bindingShotForId === item.id && (
                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <div className="text-[10.5px] text-white/60">
                      Pick a rendered Studio shot to bind as REF BOUND:
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                      {completedShots.slice(0, 8).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => void handleBindStudioShotToLedger(item, s)}
                          className="flex items-center gap-1.5 p-1 rounded-[8px] bg-black/50 border border-white/15 hover:border-white/40 text-left cursor-pointer"
                        >
                          {s.thumbnailDataUrl && (
                            <img
                              src={s.thumbnailDataUrl}
                              alt={s.label}
                              className="w-7 h-7 rounded object-cover shrink-0"
                            />
                          )}
                          <span className="text-[10.5px] font-mono text-white truncate">
                            {s.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <section
      data-testid="director-v5-view"
      className="h-[calc(100dvh-116px)] md:h-[calc(100dvh-80px)] flex flex-col max-w-[1536px] w-full mx-auto px-3 sm:px-6 md:px-8 pt-2 pb-2 overflow-hidden"
    >
      {/* Hidden File Inputs */}
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleUploadFilesToLedger(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={singleSlotUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleUploadSingleSlot(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* Top Director Control Bar */}
      <div className="flow-card p-3 sm:px-4 mb-2.5 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[#c2e7ff]/15 border border-[#c2e7ff]/30 flex items-center justify-center shrink-0">
              <Clapperboard className="w-3.5 h-3.5 text-[#c2e7ff]" />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-white leading-tight flex items-center gap-1.5">
                <span>Director v5.0.3</span>
                {lastAssistant?.checksStamp && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#29c58f]/15 text-[#29c58f] border border-[#29c58f]/35">
                    CHECKS: {lastAssistant.checksStamp}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-white/50 truncate max-w-[230px] sm:max-w-[360px]">
                {lastAssistant?.stepBadge || '[STEP 0 — ENTRY QUESTION]'}
              </div>
            </div>
          </div>

          {sessions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Director session"
                value={activeSession?.id ?? ''}
                onChange={(e) => onSelectSession(e.target.value)}
                className="flow-select-pill max-w-[165px] sm:max-w-[210px] truncate px-3 py-1 text-[12px] cursor-pointer"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="director-new-session-btn"
                onClick={() => void createNewSession()}
                disabled={initializing || sending}
                title="New Director v5 Session (STEP 0)"
                className="flow-btn-glass w-7 h-7 flex items-center justify-center cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {activeSession && sessions.length > 1 && (
                <button
                  type="button"
                  onClick={() => void onDeleteSession(activeSession.id)}
                  title="Delete current Director session"
                  className="flow-btn-glass w-7 h-7 flex items-center justify-center text-white/55 hover:text-[#fe6e6e] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* LLM Tier Pill -> opens inline $0 Gemini 2.5 Flash Key Setup */}
          <button
            type="button"
            data-testid="director-gemini-toggle-btn"
            onClick={() => setGeminiBarOpen((v) => !v)}
            title={
              geminiAvailable
                ? 'Upgraded to $0 Free-Tier Gemini 2.5 Flash (full verbatim MASTER PROMPT v5.0.3)'
                : 'Running $0 Zero-Key Mode — click to add a free Google AI Studio key for unlimited Gemini 2.5 Flash'
            }
            className={`px-3 py-1.5 rounded-[32px] border text-[11.5px] font-medium flex items-center gap-1.5 transition cursor-pointer ${
              geminiAvailable
                ? 'bg-[#29c58f]/12 border-[#29c58f]/35 text-[#29c58f]'
                : 'bg-white/[0.04] border-white/15 text-white/80 hover:border-white/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">
              {geminiAvailable ? 'Gemini 2.5 Flash ($0)' : 'Free Zero-Key ($0) · Add Gemini Key'}
            </span>
            <span className="sm:hidden">{geminiAvailable ? 'Gemini 2.5' : 'Free $0'}</span>
          </button>

          {/* Mobile Asset Inventory Ledger Toggle */}
          <button
            type="button"
            data-testid="mobile-ledger-toggle-btn"
            onClick={() => setMobileLedgerOpen(true)}
            className="lg:hidden flow-btn-glass px-3 py-1.5 text-[11.5px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-[#c2e7ff]" />
            <span>
              Ledger ({ledgerCounts.refBound + ledgerCounts.approved}/{ledgerCounts.total})
            </span>
          </button>
        </div>
        </div>

        {/* Inline Free Gemini 2.5 Flash Key Setup Drawer */}
        {geminiBarOpen && (
          <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center gap-2 text-[12px]">
            <KeyRound className="w-3.5 h-3.5 text-[#c2e7ff] shrink-0" />
            <span className="text-white/75">
              Optional <strong className="text-white">$0 Free Gemini 2.5 Flash</strong> (full 130 KB verbatim v5.0.3):
            </span>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-[#c2e7ff] hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Get Free Key <ExternalLink className="w-3 h-3" />
            </a>
            <div className="flex items-center gap-1.5 flex-1 min-w-[210px]">
              <input
                type="password"
                autoComplete="off"
                value={geminiDraft}
                onChange={(e) => setGeminiDraft(e.target.value)}
                placeholder="AIzaSy... (stored locally in IndexedDB)"
                className="flow-input flex-1 min-w-0 px-2.5 py-1 text-[12px] font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  void onSaveGeminiKey(geminiDraft);
                  setGeminiBarOpen(false);
                }}
                className="flow-cta-primary px-3 py-1 text-[11.5px] cursor-pointer shrink-0"
              >
                Save Key
              </button>
              <button
                type="button"
                onClick={() => setGeminiBarOpen(false)}
                className="p-1 text-white/50 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Responsive Two-Column Workspace (locked viewport — zero overlap) */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left: Independent Scrollable Pipeline Feed + Solid Footer Composer */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
          {errorBanner && (
            <div className="mb-2 px-3.5 py-2.5 rounded-[14px] bg-[#b22f25]/20 border border-[#fe6e6e]/40 text-[12.5px] text-[#fe6e6e] flex items-center justify-between gap-2 shrink-0">
              <span className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">{errorBanner}</span>
              </span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Scrollable Conversation Stream */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 pb-4" data-testid="director-message-feed">
            {initializing && !activeSession ? (
              <div className="flow-card p-8 flex flex-col items-center justify-center gap-2 text-white/70">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-[13px]">Loading MASTER PROMPT v5.0.3 Pipeline…</span>
              </div>
            ) : (
              (activeSession?.messages ?? []).map((msg, mIdx) => {
                const isLast = mIdx === (activeSession?.messages.length ?? 0) - 1;
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[88%] sm:max-w-[75%] rounded-[20px] rounded-tr-[6px] px-4 py-2.5 bg-white text-[#121317] text-[13.5px] font-medium leading-[20px] whitespace-pre-wrap break-words shadow-lg">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                const displayProse = cleanAssistantDisplayText(msg);
                const actionableBlocks = (msg.promptBlocks || []).filter(
                  (b) => b.generationKind !== 'meta'
                );

                return (
                  <article
                    key={msg.id}
                    data-testid={isLast ? 'director-latest-turn' : undefined}
                    className="flow-card p-4 sm:p-5 space-y-4"
                  >
                    {/* Assistant Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {msg.stepBadge && (
                          <span className="px-2.5 py-0.5 rounded-[32px] bg-[#c2e7ff]/15 border border-[#c2e7ff]/30 text-[#c2e7ff] text-[11px] font-mono font-medium">
                            {msg.stepBadge}
                          </span>
                        )}
                        {msg.checksStamp && (
                          <span className="px-2 py-0.5 rounded-[32px] bg-[#29c58f]/15 border border-[#29c58f]/35 text-[#29c58f] text-[10.5px] font-mono">
                            CHECKS: {msg.checksStamp}
                          </span>
                        )}
                      </div>
                      {msg.provider && (
                        <span className="text-[11px] text-white/45 font-mono truncate">
                          {msg.provider}
                        </span>
                      )}
                    </div>

                    {/* Formatted Director Response Prose */}
                    {displayProse && <LightweightMarkdown text={displayProse} />}

                    {/* Extracted Actionable Prompt Blocks (Queue A / Quartet / Blueprint / Queue B / Motion) */}
                    {actionableBlocks.length > 0 && (
                      <div className="space-y-3 pt-1">
                        {actionableBlocks.map((block) => {
                          const rawJobRef = activeSession?.dispatchedJobs?.[block.id];
                          const dispatchedIds = Array.isArray(rawJobRef)
                            ? rawJobRef
                            : rawJobRef
                              ? [rawJobRef]
                              : [];
                          const dispatchedShots = dispatchedIds
                            .map((id) => shotById.get(id))
                            .filter((s): s is MediaShot => Boolean(s));
                          const dispatchedShot = dispatchedShots[0];
                          const shotThumb =
                            dispatchedShot?.thumbnailDataUrl ||
                            (dispatchedShot?.blobKey
                              ? blobUrls[dispatchedShot.blobKey]
                              : undefined);
                          const currentBoundShotId = block.assetFilename
                            ? ledgerByFilename.get(block.assetFilename.toLowerCase())?.linkedShotId
                            : undefined;

                          return (
                            <div
                              key={block.id}
                              data-testid={`director-prompt-block-${block.category}`}
                              className="rounded-[16px] border border-white/20 bg-black/55 p-3.5 sm:p-4 space-y-3"
                            >
                              {/* Block Header */}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span
                                    className={`px-2 py-0.5 rounded-[32px] text-[10px] font-mono font-semibold border ${
                                      block.generationKind === 'video'
                                        ? 'bg-[#9e9eff]/15 text-[#9e9eff] border-[#9e9eff]/35'
                                        : 'bg-[#c2e7ff]/15 text-[#c2e7ff] border-[#c2e7ff]/35'
                                    }`}
                                  >
                                    {categoryLabel(block.category)}
                                  </span>
                                  {block.assetFilename && (
                                    <span className="px-2 py-0.5 rounded-[32px] bg-white/10 text-white text-[11px] font-mono">
                                      {block.assetFilename}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-white/50 font-mono">
                                    {block.aspectRatio}
                                    {block.generationKind === 'video'
                                      ? ` · ${block.durationSec}s`
                                      : ''}
                                  </span>
                                </div>
                              </div>

                              {/* ATTACH Line & Live Ledger Match Pills */}
                              {block.attachFiles.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                  <span className="inline-flex items-center gap-1 text-white/55 font-mono">
                                    <Paperclip className="w-3 h-3" />
                                    ATTACH:
                                  </span>
                                  {block.attachFiles.map((fn) => {
                                    const entry = ledgerByFilename.get(fn.toLowerCase());
                                    const st: DirectorAssetStatus = entry?.status || 'PENDING';
                                    return (
                                      <span
                                        key={fn}
                                        className={`px-2 py-0.5 rounded-full border font-mono text-[10.5px] ${statusPillClasses(
                                          st
                                        )}`}
                                      >
                                        {fn} · {st}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Clean Copy-Ready Prompt Body */}
                              <pre className="p-3 rounded-[12px] bg-[#131314] border border-white/12 font-mono text-[11.5px] leading-[18px] text-white/90 whitespace-pre-wrap break-words max-h-56 overflow-y-auto select-all">
                                {block.copyText}
                              </pre>

                              {/* Live Studio Render Status (Multi-Take Quartet 4x Gallery OR Single Shot Status) */}
                              {dispatchedShots.length > 1 ? (
                                <div
                                  data-testid="director-quartet-gallery"
                                  className="rounded-[12px] border border-white/15 bg-white/[0.03] p-2.5 space-y-2"
                                >
                                  <div className="flex items-center justify-between text-[11.5px] text-white/75">
                                    <span>
                                      Frame Quartet Candidates ({dispatchedShots.filter((s) => s.status === 'completed').length}/
                                      {dispatchedShots.length} ready) — pick winner to lock{' '}
                                      <code className="font-mono text-[#c2e7ff]">
                                        {block.assetFilename || `${block.shotId || 'S1'}_f.jpg`}
                                      </code>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={onOpenStudio}
                                      className="text-white/70 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      Studio <ArrowRight className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {dispatchedShots.map((cand, cIdx) => {
                                      const letter = String.fromCharCode(65 + cIdx);
                                      const cThumb =
                                        cand.thumbnailDataUrl ||
                                        (cand.blobKey ? blobUrls[cand.blobKey] : undefined);
                                      const isWinner = currentBoundShotId === cand.id;
                                      return (
                                        <div
                                          key={cand.id}
                                          data-testid={`quartet-candidate-${letter}`}
                                          className={`rounded-[10px] border overflow-hidden bg-black/60 flex flex-col ${
                                            isWinner ? 'border-[#29c58f]' : 'border-white/15'
                                          }`}
                                        >
                                          <div
                                            onClick={() => {
                                              if (cand.status === 'completed') onOpenLightbox(cand);
                                            }}
                                            className={`aspect-video bg-[#131314] relative flex items-center justify-center ${
                                              cand.status === 'completed' ? 'cursor-pointer' : ''
                                            }`}
                                          >
                                            {cand.status === 'completed' && cThumb ? (
                                              <img
                                                src={cThumb}
                                                alt={`Candidate ${letter}`}
                                                className="w-full h-full object-cover"
                                              />
                                            ) : cand.status === 'failed' ? (
                                              <div className="p-2 text-center space-y-1">
                                                <AlertCircle className="w-4 h-4 text-[#fe6e6e] mx-auto" />
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRetryShot(cand);
                                                  }}
                                                  className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-white cursor-pointer"
                                                >
                                                  Retry
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="text-center p-2">
                                                <Loader2 className="w-4 h-4 animate-spin text-[#c2e7ff] mx-auto" />
                                                <div className="text-[10px] text-white/60 mt-1">
                                                  {cand.progress}%
                                                </div>
                                              </div>
                                            )}
                                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-black/70 text-[10px] font-mono text-white border border-white/15">
                                              {letter} · {cand.label}
                                            </span>
                                          </div>
                                          {cand.status === 'completed' && activeSession && (
                                            <button
                                              type="button"
                                              data-testid={`quartet-pick-${letter}`}
                                              onClick={() =>
                                                void onPickQuartetWinner(activeSession.id, block, cand)
                                              }
                                              className={`w-full py-1 text-[10.5px] font-medium transition cursor-pointer ${
                                                isWinner
                                                  ? 'bg-[#29c58f] text-[#0b1b15]'
                                                  : 'bg-white/8 text-white hover:bg-white/18'
                                              }`}
                                            >
                                              {isWinner ? `✓ Locked ${letter}` : `Pick ${letter}`}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : dispatchedShot ? (
                                <div className="rounded-[12px] border border-white/15 bg-white/[0.04] p-2.5 flex flex-wrap items-center justify-between gap-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    {dispatchedShot.status === 'completed' && shotThumb ? (
                                      <button
                                        type="button"
                                        onClick={() => onOpenLightbox(dispatchedShot)}
                                        className="w-12 h-9 rounded-[8px] overflow-hidden border border-white/20 shrink-0 cursor-pointer"
                                      >
                                        {dispatchedShot.kind === 'video' && !dispatchedShot.thumbnailDataUrl ? (
                                          <video
                                            src={shotThumb}
                                            muted
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <img
                                            src={shotThumb}
                                            alt={dispatchedShot.label}
                                            className="w-full h-full object-cover"
                                          />
                                        )}
                                      </button>
                                    ) : dispatchedShot.status === 'failed' ? (
                                      <AlertCircle className="w-4 h-4 text-[#fe6e6e] shrink-0" />
                                    ) : (
                                      <Loader2 className="w-4 h-4 text-[#c2e7ff] animate-spin shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[12px] font-medium text-white break-words">
                                        {dispatchedShot.status === 'completed' ? (
                                          <span className="inline-flex items-center gap-1 text-[#29c58f]">
                                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                            Rendered {dispatchedShot.label} &amp; Auto-Bound to Ledger
                                          </span>
                                        ) : dispatchedShot.status === 'failed' ? (
                                          <span className="text-[#fe6e6e]">
                                            {dispatchedShot.label} failed: {dispatchedShot.error}
                                          </span>
                                        ) : (
                                          <span>
                                            Rendering {dispatchedShot.label} ({dispatchedShot.progress}%) —{' '}
                                            {dispatchedShot.phase}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {dispatchedShot.status === 'failed' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => onRetryShot(dispatchedShot)}
                                          className="flow-btn-glass px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                          Retry
                                        </button>
                                        {dispatchedShot.kind === 'video' && (
                                          <button
                                            type="button"
                                            onClick={onOpenEngine}
                                            className="flow-cta-primary px-2.5 py-1 text-[11px] cursor-pointer"
                                          >
                                            Setup GPU
                                          </button>
                                        )}
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={onOpenStudio}
                                      className="flow-btn-glass px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>Studio</span>
                                      <ArrowRight className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {/* Dual 1-Click Action Bar: (a) Generate in Studio & (b) Copy for Google Flow */}
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  data-testid="director-generate-studio-btn"
                                  onClick={() =>
                                    activeSession &&
                                    void onDispatchPromptBlock(activeSession.id, block, 1)
                                  }
                                  className="flow-cta-primary px-3.5 py-2 text-[12px] inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  {block.generationKind === 'video' ? (
                                    <Film className="w-3.5 h-3.5 stroke-[1.8]" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5 stroke-[1.8]" />
                                  )}
                                  <span>Generate in Studio</span>
                                </button>

                                {block.isQuartet && (
                                  <button
                                    type="button"
                                    data-testid="director-generate-quartet4-btn"
                                    onClick={() =>
                                      activeSession &&
                                      void onDispatchPromptBlock(activeSession.id, block, 4)
                                    }
                                    className="flow-btn-glass px-3 py-2 text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Layers className="w-3.5 h-3.5 text-[#c2e7ff]" />
                                    <span>Quartet 4× Takes</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  data-testid="director-copy-flow-btn"
                                  onClick={() => void handleCopyPrompt(block)}
                                  className="flow-btn-glass px-3.5 py-2 text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  {copiedId === block.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-[#29c58f]" />
                                      <span className="text-[#29c58f]">Copied for Flow</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copy for Google Flow</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 12-Point Acceptance Card Grid */}
                    {msg.acceptanceCard && msg.acceptanceCard.cells.length > 0 && (
                      <div
                        data-testid="director-acceptance-card"
                        className="rounded-[16px] border border-[#c2e7ff]/25 bg-[#131314]/90 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#c2e7ff]">
                            <ShieldCheck className="w-4 h-4" />
                            12-Point Acceptance Card — {msg.acceptanceCard.shotId}
                          </span>
                          <span className="text-[10.5px] font-mono text-white/45">
                            Verify before PASS
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                          {msg.acceptanceCard.cells.map((cell) => (
                            <div
                              key={cell.index}
                              className="rounded-[10px] border border-white/10 bg-white/[0.03] px-2.5 py-2"
                            >
                              <div className="text-[10px] font-mono font-semibold text-white/60 uppercase">
                                {cell.index}. {cell.name}
                              </div>
                              <div className="text-[11.5px] text-white/85 leading-[16px] mt-0.5">
                                {cell.detail}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tappable Choice Buttons (1..N) — active on latest assistant turn */}
                    {isLast && (msg.options?.length ?? 0) > 0 && (
                      <div
                        data-testid="director-choice-menu"
                        className="pt-2 border-t border-white/10 space-y-2"
                      >
                        <div className="text-[11px] font-medium uppercase tracking-wider text-white/45">
                          Select Next Action (Tap 1–{msg.options!.length})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.options!.map((opt) => (
                            <button
                              key={opt.number}
                              type="button"
                              disabled={sending}
                              data-testid={`director-option-${opt.number}`}
                              onClick={() => {
                                if (opt.isCustom) {
                                  inputRef.current?.focus();
                                  return;
                                }
                                void handleSend(opt.value);
                              }}
                              className={`text-left px-3.5 py-2.5 rounded-[14px] border text-[12.5px] leading-[18px] transition flex items-start gap-2.5 cursor-pointer disabled:opacity-50 ${
                                opt.recommended
                                  ? 'bg-white text-[#121317] border-white font-medium hover:bg-white/90'
                                  : opt.isExpress
                                    ? 'bg-[#9e9eff]/12 border-[#9e9eff]/35 text-white hover:bg-[#9e9eff]/20'
                                    : 'bg-white/[0.04] border-white/15 text-white/90 hover:bg-white/10 hover:border-white/30'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-full text-[11px] font-mono font-semibold flex items-center justify-center shrink-0 mt-0.5 ${
                                  opt.recommended
                                    ? 'bg-[#121317] text-white'
                                    : 'bg-white/12 text-white'
                                }`}
                              >
                                {opt.number}
                              </span>
                              <span className="min-w-0 flex-1 break-words">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}

            {sending && (
              <div className="flow-card p-4 flex items-center gap-2.5 text-[13px] text-white/75">
                <Loader2 className="w-4 h-4 animate-spin text-[#c2e7ff]" />
                <span>Compiling next MASTER PROMPT v5.0.3 step…</span>
              </div>
            )}

            <div ref={feedEndRef} />
          </div>

          {/* Non-Overlapping Footer Composer */}
          <div data-testid="director-composer-footer" className="shrink-0 pt-2 border-t border-white/10 bg-black/80 backdrop-blur-md">
            <div className="flow-composer-shell p-2.5 sm:p-3 space-y-2">
              {/* Quick v5.0.3 Triggers */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'ASSETS READY', cmd: 'ASSETS READY' },
                  { label: 'RECOMMENDED ALL', cmd: 'RECOMMENDED ALL' },
                  { label: 'STATUS', cmd: 'STATUS' },
                  { label: 'BUILD', cmd: 'BUILD' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={sending || !activeSession}
                    onClick={() => void handleSend(chip.cmd)}
                    className="px-2.5 py-1 rounded-[32px] bg-white/[0.06] hover:bg-white/14 border border-white/12 text-[11px] font-mono text-white/75 hover:text-white transition cursor-pointer disabled:opacity-40"
                  >
                    {chip.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => uploadRef.current?.click()}
                  className="px-2.5 py-1 rounded-[32px] bg-[#29c58f]/12 hover:bg-[#29c58f]/20 border border-[#29c58f]/35 text-[11px] font-medium text-[#29c58f] inline-flex items-center gap-1 transition cursor-pointer ml-auto"
                >
                  <Upload className="w-3 h-3" />
                  <span>Bind REF</span>
                </button>
              </div>

              {/* Input Row */}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={2}
                  data-testid="director-chat-input"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend(inputText);
                    }
                  }}
                  placeholder="Paste a script, story idea, PATCH command, or pick a choice button above…"
                  className="flow-input flex-1 min-w-0 px-3 py-2 text-[13.5px] leading-[20px] resize-none max-h-40"
                />
                <button
                  type="button"
                  data-testid="director-send-btn"
                  disabled={sending || !inputText.trim() || !activeSession}
                  onClick={() => void handleSend(inputText)}
                  className="flow-cta-primary h-10 px-4 text-[13px] inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40 cursor-pointer"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Desktop Sidebar: Asset Inventory Ledger */}
        <aside
          data-testid="director-ledger-sidebar"
          className="hidden lg:flex lg:w-[336px] xl:w-[360px] shrink-0 flow-card overflow-hidden flex-col h-full"
        >
          {ledgerPanelBody}
        </aside>
      </div>

      {/* Mobile Slide-Over Ledger Drawer */}
      {mobileLedgerOpen && (
        <div
          className="fixed inset-0 z-[1050] lg:hidden bg-black/75 backdrop-blur-sm flex justify-end"
          onClick={() => setMobileLedgerOpen(false)}
        >
          <div
            className="flow-modal w-[90vw] max-w-[360px] h-full rounded-none rounded-l-[24px] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {ledgerPanelBody}
          </div>
        </div>
      )}
    </section>
  );
}
