import type { BibleEntry, EngineSettings, MediaShot, Project } from '../types/studio';
import { DEFAULT_ENGINE_SETTINGS } from '../types/studio';

const DB_NAME = 'flowstudio_vault_v1';
const DB_VERSION = 1;

const STORES = {
  PROJECTS: 'projects',
  BIBLE: 'bible',
  MEDIA: 'media',
  BLOBS: 'blobs',
  SETTINGS: 'settings',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openVault(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
        db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.BIBLE)) {
        const s = db.createObjectStore(STORES.BIBLE, { keyPath: 'id' });
        s.createIndex('by_project', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.MEDIA)) {
        const s = db.createObjectStore(STORES.MEDIA, { keyPath: 'id' });
        s.createIndex('by_project', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.BLOBS)) {
        db.createObjectStore(STORES.BLOBS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB vault'));
  });
  return dbPromise;
}

function txRun<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openVault().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// ── Projects ──────────────────────────────────────────────────────────
export async function listProjects(): Promise<Project[]> {
  const rows = await txRun<Project[]>(STORES.PROJECTS, 'readonly', (s) => s.getAll());
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProject(project: Project): Promise<void> {
  await txRun(STORES.PROJECTS, 'readwrite', (s) => s.put(project));
}

export async function deleteProject(projectId: string): Promise<void> {
  const [shots, entries] = await Promise.all([
    listProjectShots(projectId),
    listProjectBible(projectId),
  ]);
  for (const shot of shots) {
    if (shot.blobKey) await deleteBlob(shot.blobKey);
    await deleteShot(shot.id);
  }
  for (const entry of entries) {
    await deleteBibleEntry(entry.id);
  }
  await txRun(STORES.PROJECTS, 'readwrite', (s) => s.delete(projectId));
}

// ── Bible (@TAG Vault) ────────────────────────────────────────────────
export async function listProjectBible(projectId: string): Promise<BibleEntry[]> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BIBLE, 'readonly');
    const idx = tx.objectStore(STORES.BIBLE).index('by_project');
    const req = idx.getAll(projectId);
    req.onsuccess = () => {
      const list = (req.result as BibleEntry[]).sort((a, b) => a.tag.localeCompare(b.tag));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveBibleEntry(entry: BibleEntry): Promise<void> {
  await txRun(STORES.BIBLE, 'readwrite', (s) => s.put(entry));
}

export async function deleteBibleEntry(id: string): Promise<void> {
  await txRun(STORES.BIBLE, 'readwrite', (s) => s.delete(id));
}

// ── Media Shots ───────────────────────────────────────────────────────
export async function listProjectShots(projectId: string): Promise<MediaShot[]> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MEDIA, 'readonly');
    const idx = tx.objectStore(STORES.MEDIA).index('by_project');
    const req = idx.getAll(projectId);
    req.onsuccess = () => {
      const list = (req.result as MediaShot[]).sort((a, b) => b.createdAt - a.createdAt);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveShot(shot: MediaShot): Promise<void> {
  await txRun(STORES.MEDIA, 'readwrite', (s) => s.put(shot));
}

export async function deleteShot(id: string): Promise<void> {
  await txRun(STORES.MEDIA, 'readwrite', (s) => s.delete(id));
}

// ── Binary Media Blobs (Offline Permanent Storage) ────────────────────
export async function saveBlob(key: string, blob: Blob): Promise<void> {
  try {
    await txRun(STORES.BLOBS, 'readwrite', (s) => s.put({ key, blob, savedAt: Date.now() }));
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'QuotaExceededError') {
      throw new Error(
        'Browser offline Vault is full. Delete older shots or export your project JSON to free space.'
      );
    }
    throw err;
  }
}

export async function loadBlob(key: string): Promise<Blob | null> {
  const row = await txRun<{ key: string; blob: Blob } | undefined>(STORES.BLOBS, 'readonly', (s) =>
    s.get(key)
  );
  return row?.blob ?? null;
}

export async function deleteBlob(key: string): Promise<void> {
  await txRun(STORES.BLOBS, 'readwrite', (s) => s.delete(key));
}

// ── Settings ──────────────────────────────────────────────────────────
export async function loadEngineSettings(): Promise<EngineSettings> {
  const row = await txRun<{ key: string; value: EngineSettings } | undefined>(
    STORES.SETTINGS,
    'readonly',
    (s) => s.get('engine')
  );
  return { ...DEFAULT_ENGINE_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveEngineSettings(settings: EngineSettings): Promise<void> {
  await txRun(STORES.SETTINGS, 'readwrite', (s) => s.put({ key: 'engine', value: settings }));
}

export async function getVaultUsageBytes(): Promise<{ usedMB: number; quotaMB: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return {
      usedMB: Math.round(((est.usage ?? 0) / (1024 * 1024)) * 10) / 10,
      quotaMB: Math.round(((est.quota ?? 0) / (1024 * 1024)) * 10) / 10,
    };
  }
  return { usedMB: 0, quotaMB: 0 };
}

// ── Portable Project Backup (Fixes Multi-Profile Lock-In) ─────────────
export async function exportProjectManifestJson(project: Project): Promise<string> {
  const [bible, shots] = await Promise.all([
    listProjectBible(project.id),
    listProjectShots(project.id),
  ]);
  return JSON.stringify(
    {
      schema: 'flowstudio-project-v1',
      exportedAt: new Date().toISOString(),
      project,
      bible,
      shots,
    },
    null,
    2
  );
}
