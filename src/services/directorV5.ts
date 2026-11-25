import type {
  BibleEntry,
  DirectorAcceptanceCard,
  DirectorAssetLedgerItem,
  DirectorAssetStatus,
  DirectorMenuOption,
  DirectorPromptBlock,
  DirectorSessionState,
} from '../types/studio';

export interface DirectorV5ApiResponse {
  ok: boolean;
  version: string;
  provider: string;
  providerTier: 'gemini' | 'pollinations' | 'deterministic';
  usingServerKey: boolean;
  warning?: string | null;
  cooldownSec?: number | null;
  text: string;
  stepBadge: string | null;
  stage: string;
  options: DirectorMenuOption[];
  promptBlocks: DirectorPromptBlock[];
  acceptanceCard: DirectorAcceptanceCard | null;
  checksStamp: string | null;
  ledgerUpdates: Array<{
    filename: string;
    token: string;
    role: string;
    status: DirectorAssetStatus;
    shotId?: string;
  }>;
  sessionState: DirectorSessionState;
  error?: string;
}

export const DEFAULT_DIRECTOR_STATE: DirectorSessionState = {
  stage: 'step0',
  presetKey: null,
  sourceText: '',
  built: false,
  queueACardIdx: 0,
  shotIdx: 0,
  quartetBatch: 1,
  shotsPassed: 0,
};

export function inferLedgerMetaFromFilename(filename: string): { token: string; role: string } {
  const clean = filename.trim();
  const lower = clean.toLowerCase();

  let m = /^([a-z0-9_-]+)_w(\d+)_(?:sheet|facef|bodyf)\./i.exec(clean);
  if (m) return { token: `@${m[1].toUpperCase()}_W${m[2]}`, role: 'face lock' };

  m = /^blueprint_([a-z0-9_-]+)\./i.exec(clean);
  if (m) return { token: `@SET-${m[1].toUpperCase()}`, role: 'blueprint' };

  m = /^set_([a-z0-9_-]+)_(?:sheet|angles|main)\./i.exec(clean);
  if (m) {
    return {
      token: `@SET-${m[1].toUpperCase()}`,
      role: lower.includes('_angles') ? 'spatial angles' : 'spatial lock',
    };
  }

  m = /^prop_([a-z0-9_-]+?)(?:_sheet)?\./i.exec(clean);
  if (m) return { token: `@PROP-${m[1].toUpperCase()}`, role: 'prop lock' };

  m = /^(S\d+[A-Za-z]?)(?:_f(?:-[A-D])?|_lastf)?\.(?:jpg|jpeg|png|webp|mp4)$/i.exec(clean);
  if (m) {
    const role = lower.endsWith('.mp4')
      ? 'finished clip'
      : lower.includes('_lastf')
        ? 'last frame'
        : 'start frame';
    return { token: m[1].toUpperCase(), role };
  }

  const base = clean.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '_') || 'ASSET';
  return { token: `@${base}`, role: 'reference' };
}

/**
 * Merges newly discovered ledger entries while strictly enforcing MASTER PROMPT v5.0.3 §9.7
 * Never-Regenerate Law: an already REF BOUND or APPROVED asset is never silently downgraded to PENDING.
 */
export function mergeLedgerUpdates(
  current: DirectorAssetLedgerItem[],
  updates: Array<{
    filename: string;
    token?: string;
    role?: string;
    status: DirectorAssetStatus;
    shotId?: string;
    linkedShotId?: string;
    previewDataUrl?: string;
  }>,
  allowDowngrade = false
): DirectorAssetLedgerItem[] {
  const rank: Record<DirectorAssetStatus, number> = {
    PENDING: 1,
    APPROVED: 2,
    'REF BOUND': 3,
  };
  const map = new Map<string, DirectorAssetLedgerItem>();
  for (const item of current) {
    map.set(item.filename.toLowerCase(), item);
  }

  const now = Date.now();
  for (const upd of updates) {
    const cleanFile = String(upd.filename || '').trim();
    if (!cleanFile) continue;
    const key = cleanFile.toLowerCase();
    const existing = map.get(key);
    const inferred = inferLedgerMetaFromFilename(cleanFile);

    if (existing) {
      const nextStatus =
        allowDowngrade || rank[upd.status] >= rank[existing.status] ? upd.status : existing.status;
      map.set(key, {
        ...existing,
        token: upd.token || existing.token || inferred.token,
        role: upd.role || existing.role || inferred.role,
        status: nextStatus,
        shotId: upd.shotId ?? existing.shotId,
        linkedShotId: upd.linkedShotId ?? existing.linkedShotId,
        previewDataUrl: upd.previewDataUrl ?? existing.previewDataUrl,
        updatedAt: now,
      });
    } else {
      map.set(key, {
        id: `led_${now}_${Math.random().toString(36).slice(2, 7)}`,
        filename: cleanFile,
        token: upd.token || inferred.token,
        role: upd.role || inferred.role,
        status: upd.status,
        shotId: upd.shotId,
        linkedShotId: upd.linkedShotId,
        previewDataUrl: upd.previewDataUrl,
        updatedAt: now,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const order = { 'REF BOUND': 0, APPROVED: 1, PENDING: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.filename.localeCompare(b.filename);
  });
}

export async function initDirectorV5Session(geminiApiKey?: string): Promise<DirectorV5ApiResponse> {
  const resp = await fetch('/api/director-v5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'init',
      geminiApiKey: geminiApiKey?.trim() || '',
    }),
  });
  const data = (await resp.json()) as DirectorV5ApiResponse;
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || `Director v5 init failed (HTTP ${resp.status})`);
  }
  return data;
}

export async function sendDirectorV5Turn(params: {
  userInput: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  ledger: DirectorAssetLedgerItem[];
  bible: BibleEntry[];
  sessionState: DirectorSessionState;
  geminiApiKey?: string;
}): Promise<DirectorV5ApiResponse> {
  // Strip base64 previews before hitting serverless API to keep request payloads tiny & instant
  const compactLedger = params.ledger.map(({ filename, token, role, status, shotId }) => ({
    filename,
    token,
    role,
    status,
    shotId,
  }));
  const compactBible = params.bible.map(({ tag, category, title, descriptor }) => ({
    tag,
    category,
    title,
    descriptor,
  }));

  const resp = await fetch('/api/director-v5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'turn',
      userInput: params.userInput,
      history: params.history.slice(-16),
      ledger: compactLedger,
      bible: compactBible,
      sessionState: params.sessionState,
      geminiApiKey: params.geminiApiKey?.trim() || '',
    }),
  });
  const data = (await resp.json()) as DirectorV5ApiResponse;
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || `Director v5 request failed (HTTP ${resp.status})`);
  }
  return data;
}
