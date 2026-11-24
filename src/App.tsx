import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteBibleEntry,
  deleteBlob,
  deleteShot,
  exportProjectManifestJson,
  getVaultUsageBytes,
  listProjectBible,
  listProjectShots,
  listProjects,
  loadBlob,
  loadEngineSettings,
  saveBibleEntry,
  saveBlob,
  saveEngineSettings,
  saveProject,
  saveShot,
} from './db/vault';
import {
  ASPECT_DIMENSIONS,
  DEFAULT_ENGINE_SETTINGS,
  type AspectRatio,
  type BibleEntry,
  type EngineSettings,
  type GenerationMode,
  type MediaShot,
  type ParsedScriptShot,
  type Project,
} from './types/studio';
import { compilePromptWithBible } from './utils/promptCompiler';
import { blobToDataUrl, grabVideoFrame } from './utils/frameGrabber';
import {
  runImageGeneration,
  runVideoGeneration,
  type ColabHealthStatus,
} from './services/engine';
import { TopBar } from './components/TopBar';
import { BibleDrawer } from './components/BibleDrawer';
import {
  FloatingComposer,
  type ComposerSubmitPayload,
} from './components/FloatingComposer';
import { MediaGrid } from './components/MediaGrid';
import { LightboxModal } from './components/LightboxModal';
import { StoryboardBar } from './components/StoryboardBar';
import { ScriptImportModal } from './components/ScriptImportModal';
import { EngineModal } from './components/EngineModal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

let bootstrapPromise: Promise<{ projects: Project[]; settings: EngineSettings }> | null = null;

function ensureVaultBootstrapped(): Promise<{ projects: Project[]; settings: EngineSettings }> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const [loadedProjects, loadedSettings] = await Promise.all([
        listProjects(),
        loadEngineSettings(),
      ]);

      if (loadedProjects.length === 0) {
        const defaultProj: Project = {
          id: 'proj_default_pilot',
          name: 'Pilot Cinema Project',
          description: 'Zero-Cost AI Cinema Workspace',
          aspectRatio: '16:9',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await saveProject(defaultProj);

        const starterTags: BibleEntry[] = [
          {
            id: 'bible_default_mira',
            projectId: defaultProj.id,
            tag: '@MIRA',
            category: 'character',
            title: 'Mira',
            descriptor:
              '21yo Filipina woman, shoulder-length jet black hair, cream knit cardigan, expressive dark eyes, natural cinematic lighting',
            lockedSeed: 778899,
            createdAt: Date.now(),
          },
          {
            id: 'bible_default_locd',
            projectId: defaultProj.id,
            tag: '@LOC-D',
            category: 'location',
            title: 'Manila Rain Dormitory',
            descriptor:
              'cozy 1990s Manila dormitory room at night, warm amber desk lamp, cool rain-streaked glass window, volumetric atmosphere',
            createdAt: Date.now() + 1,
          },
        ];
        for (const tag of starterTags) await saveBibleEntry(tag);
        return { projects: [defaultProj], settings: loadedSettings };
      }

      return { projects: loadedProjects, settings: loadedSettings };
    })();
  }
  return bootstrapPromise;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [bible, setBible] = useState<BibleEntry[]>([]);
  const [shots, setShots] = useState<MediaShot[]>([]);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(DEFAULT_ENGINE_SETTINGS);
  const [colabHealth, setColabHealth] = useState<ColabHealthStatus | null>(null);
  const [vaultMB, setVaultMB] = useState(0);

  // Composer controlled state
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<GenerationMode>('t2i');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [startFrameDataUrl, setStartFrameDataUrl] = useState<string | undefined>(undefined);

  // Drawers / Modals / Toast
  const [bibleOpen, setBibleOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [lightboxShotId, setLightboxShotId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const processingRef = useRef(false);
  const blobUrlsRef = useRef<Record<string, string>>({});
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const refreshVaultUsage = useCallback(async () => {
    const usage = await getVaultUsageBytes();
    setVaultMB(usage.usedMB);
  }, []);

  // Capture PWA install prompt
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  // Initial IndexedDB hydration (singleton-safe under React 19 StrictMode)
  useEffect(() => {
    let active = true;
    void ensureVaultBootstrapped().then(async ({ projects: loadedProjects, settings: loadedSettings }) => {
      if (!active) return;
      setEngineSettings(loadedSettings);
      setProjects(loadedProjects);
      const savedId = window.localStorage.getItem('flowstudio_active_project');
      const matched = loadedProjects.find((p) => p.id === savedId);
      setActiveProjectId(matched ? matched.id : loadedProjects[0].id);
      await refreshVaultUsage();
    });
    return () => {
      active = false;
    };
  }, [refreshVaultUsage]);

  // Persist last active project selection
  useEffect(() => {
    if (activeProjectId) {
      window.localStorage.setItem('flowstudio_active_project', activeProjectId);
    }
  }, [activeProjectId]);

  // Load project Bible + Shots whenever activeProjectId changes
  useEffect(() => {
    if (!activeProjectId) return;
    void Promise.all([listProjectBible(activeProjectId), listProjectShots(activeProjectId)]).then(
      ([bList, sList]) => {
        setBible(bList);
        setShots(sList);
      }
    );
  }, [activeProjectId]);

  // Hydrate binary Blobs from IndexedDB into Object URLs
  useEffect(() => {
    let cancelled = false;
    const missingKeys = shots
      .map((s) => s.blobKey)
      .filter((k): k is string => typeof k === 'string' && k.length > 0 && !blobUrlsRef.current[k]);

    if (missingKeys.length === 0) return;

    void Promise.all(
      missingKeys.map(async (key) => {
        const blob = await loadBlob(key);
        return blob ? [key, URL.createObjectURL(blob)] as const : null;
      })
    ).then((pairs) => {
      if (cancelled) return;
      const updates: Record<string, string> = {};
      for (const pair of pairs) {
        if (pair) {
          updates[pair[0]] = pair[1];
        }
      }
      if (Object.keys(updates).length > 0) {
        blobUrlsRef.current = { ...blobUrlsRef.current, ...updates };
        setBlobUrls({ ...blobUrlsRef.current });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shots]);

  // Revoke Object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(blobUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // Auto-processing background batch render queue (Fixes Flow Con #4 & #7)
  const updateShotState = useCallback(async (updated: MediaShot) => {
    await saveShot(updated);
    setShots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  useEffect(() => {
    if (processingRef.current) return;
    const queued = shots
      .filter((s) => s.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt);
    if (queued.length === 0) return;

    const target = queued[0];
    processingRef.current = true;

    void (async () => {
      let current: MediaShot = {
        ...target,
        status: 'processing',
        progress: 10,
        phase: 'Initializing engine...',
        error: undefined,
      };
      await updateShotState(current);

      const onProgress = (pct: number, phase: string) => {
        current = { ...current, progress: pct, phase };
        setShots((prev) => prev.map((s) => (s.id === current.id ? current : s)));
      };

      try {
        const result =
          current.kind === 'image'
            ? await runImageGeneration(current, engineSettings, onProgress)
            : await runVideoGeneration(current, engineSettings, onProgress);

        const blobKey = `blob_${current.id}`;
        await saveBlob(blobKey, result.blob);
        const objUrl = URL.createObjectURL(result.blob);
        blobUrlsRef.current = { ...blobUrlsRef.current, [blobKey]: objUrl };
        setBlobUrls({ ...blobUrlsRef.current });

        let thumb = result.thumbnailDataUrl;
        if (!thumb && current.kind === 'image') {
          thumb = await blobToDataUrl(result.blob);
        }

        const doneShot: MediaShot = {
          ...current,
          status: 'completed',
          progress: 100,
          phase: 'Saved in IndexedDB Vault',
          blobKey,
          model: result.providerLabel,
          seed: result.seed,
          thumbnailDataUrl: thumb,
          completedAt: Date.now(),
        };
        await updateShotState(doneShot);
        await refreshVaultUsage();
      } catch (err) {
        const failedShot: MediaShot = {
          ...current,
          status: 'failed',
          progress: 0,
          phase: 'Failed',
          error: err instanceof Error ? err.message : 'Generation error',
        };
        await updateShotState(failedShot);
      } finally {
        processingRef.current = false;
      }
    })();
  }, [shots, engineSettings, updateShotState, refreshVaultUsage]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const storyboardClips = useMemo(
    () =>
      shots
        .filter((s) => s.status === 'completed' && s.storyboardOrder !== null)
        .sort((a, b) => (a.storyboardOrder ?? 0) - (b.storyboardOrder ?? 0)),
    [shots]
  );

  const activeQueueCount = useMemo(
    () => shots.filter((s) => s.status === 'queued' || s.status === 'processing').length,
    [shots]
  );

  const lightboxShot = useMemo(
    () => shots.find((s) => s.id === lightboxShotId) ?? null,
    [shots, lightboxShotId]
  );

  const nextShotLabel = (offset = 0): string => {
    return `S${String(shots.length + 1 + offset).padStart(2, '0')}`;
  };

  // Actions
  const handleCreateProject = async (name: string) => {
    const proj: Project = {
      id: makeId('proj'),
      name,
      description: '',
      aspectRatio: '16:9',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveProject(proj);
    setProjects((prev) => [proj, ...prev]);
    setActiveProjectId(proj.id);
    showToast(`Created project "${name}"`);
  };

  const handleQueueSingleShot = async (payload: ComposerSubmitPayload) => {
    if (!activeProjectId) return;
    const compiled = compilePromptWithBible(payload.rawPrompt, bible);
    const kind = payload.mode === 't2i' ? 'image' : 'video';
    const [width, height] = ASPECT_DIMENSIONS[payload.aspectRatio][kind];

    const newShot: MediaShot = {
      id: makeId('shot'),
      projectId: activeProjectId,
      label: nextShotLabel(),
      kind,
      mode: payload.mode,
      status: 'queued',
      progress: 5,
      phase: 'Queued...',
      rawPrompt: payload.rawPrompt,
      compiledPrompt: compiled.compiledPrompt,
      negativePrompt: payload.negativePrompt,
      appliedTags: compiled.appliedTags,
      aspectRatio: payload.aspectRatio,
      width,
      height,
      durationSec: payload.durationSec,
      fps: 24,
      steps: payload.steps,
      cfgScale: payload.cfgScale,
      seed: payload.seed,
      engine: engineSettings.activeEngine,
      model:
        engineSettings.activeEngine === 'colab-t4'
          ? kind === 'image'
            ? engineSettings.colabModelImage
            : engineSettings.colabModelVideo
          : kind === 'image'
          ? `Free ${engineSettings.freeImageModel.toUpperCase()}`
          : 'Free 24/7 Video',
      startFrameDataUrl: payload.startFrameDataUrl,
      storyboardOrder: null,
      createdAt: Date.now(),
    };

    await saveShot(newShot);
    setShots((prev) => [newShot, ...prev]);
    setPrompt('');
    if (payload.mode === 'i2v') setStartFrameDataUrl(undefined);
    showToast(`Queued ${newShot.label} (${kind.toUpperCase()})`);
  };

  const handleBulkScriptImport = async (parsedShots: ParsedScriptShot[]) => {
    if (!activeProjectId || parsedShots.length === 0) return;
    const created: MediaShot[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < parsedShots.length; i++) {
      const item = parsedShots[i];
      const compiled = compilePromptWithBible(item.prompt, bible);
      const kind = item.mode === 't2i' ? 'image' : 'video';
      const ar = item.aspectRatio ?? aspectRatio;
      const [width, height] = ASPECT_DIMENSIONS[ar][kind];
      const shot: MediaShot = {
        id: makeId(`shot${i}`),
        projectId: activeProjectId,
        label: item.label || nextShotLabel(i),
        kind,
        mode: item.mode,
        status: 'queued',
        progress: 5,
        phase: 'Queued from Script...',
        rawPrompt: item.prompt,
        compiledPrompt: compiled.compiledPrompt,
        negativePrompt: 'blurry, low quality, distorted, watermark, text',
        appliedTags: compiled.appliedTags,
        aspectRatio: ar,
        width,
        height,
        durationSec: item.durationSec ?? 4,
        fps: 24,
        steps: 24,
        cfgScale: 6.5,
        seed: compiled.suggestedSeed ?? Math.floor(Math.random() * 2_000_000_000),
        engine: engineSettings.activeEngine,
        model: kind === 'image' ? 'Queued Image' : 'Queued Video',
        startFrameDataUrl: item.mode === 'i2v' ? compiled.suggestedRefImage : undefined,
        storyboardOrder: null,
        createdAt: baseTime + i,
      };
      await saveShot(shot);
      created.push(shot);
    }

    setShots((prev) => [...created.reverse(), ...prev]);
    showToast(`Queued ${created.length} shots from script!`);
  };

  const handleToggleStoryboard = async (shot: MediaShot) => {
    const nextOrder =
      shot.storyboardOrder !== null
        ? null
        : storyboardClips.length > 0
        ? Math.max(...storyboardClips.map((c) => c.storyboardOrder ?? 0)) + 1
        : 1;
    await updateShotState({ ...shot, storyboardOrder: nextOrder });
  };

  const handleMoveStoryboardClip = async (shotId: string, dir: -1 | 1) => {
    const idx = storyboardClips.findIndex((c) => c.id === shotId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= storyboardClips.length) return;
    const a = storyboardClips[idx];
    const b = storyboardClips[swapIdx];
    const orderA = a.storyboardOrder ?? idx + 1;
    const orderB = b.storyboardOrder ?? swapIdx + 1;
    await Promise.all([
      updateShotState({ ...a, storyboardOrder: orderB }),
      updateShotState({ ...b, storyboardOrder: orderA }),
    ]);
  };

  const handleAnimateStill = async (shot: MediaShot) => {
    let dataUrl = shot.thumbnailDataUrl;
    if (!dataUrl && shot.blobKey) {
      const blob = await loadBlob(shot.blobKey);
      if (blob) dataUrl = await blobToDataUrl(blob);
    }
    if (!dataUrl) return;
    setStartFrameDataUrl(dataUrl);
    setMode('i2v');
    if (!prompt.trim()) {
      setPrompt(`Smooth cinematic camera push-in continuing from ${shot.label}: ${shot.rawPrompt}`);
    }
    showToast(`Locked ${shot.label} as Start Frame (Frames-to-Video ready!)`);
  };

  const handleGrabLastFrameFromCard = async (shot: MediaShot) => {
    const url = shot.blobKey ? blobUrls[shot.blobKey] : undefined;
    if (!url) return;
    try {
      const vid = document.createElement('video');
      vid.crossOrigin = 'anonymous';
      vid.muted = true;
      vid.playsInline = true;
      vid.src = url;
      await new Promise<void>((resolve, reject) => {
        vid.onloadeddata = () => resolve();
        vid.onerror = () => reject(new Error('Could not decode video for frame grab'));
      });
      const grabbed = await grabVideoFrame(vid, 'last');
      setStartFrameDataUrl(grabbed.dataUrl);
      setMode('i2v');
      showToast(`Extracted last frame of ${shot.label} → Start Frame locked!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Frame extraction failed');
    }
  };

  const handleDownloadShot = (shot: MediaShot) => {
    const url = (shot.blobKey && blobUrls[shot.blobKey]) || shot.thumbnailDataUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    const ext = shot.kind === 'video' ? 'webm' : 'png';
    a.download = `${shot.label.toLowerCase()}_seed${shot.seed}.${ext}`;
    a.click();
  };

  const handleDeleteShot = async (shot: MediaShot) => {
    if (shot.blobKey) {
      await deleteBlob(shot.blobKey);
      if (blobUrlsRef.current[shot.blobKey]) {
        URL.revokeObjectURL(blobUrlsRef.current[shot.blobKey]);
        const next = { ...blobUrlsRef.current };
        delete next[shot.blobKey];
        blobUrlsRef.current = next;
        setBlobUrls(next);
      }
    }
    await deleteShot(shot.id);
    setShots((prev) => prev.filter((s) => s.id !== shot.id));
    await refreshVaultUsage();
  };

  const handleExportProjectJson = async () => {
    if (!activeProject) return;
    const json = await exportProjectManifestJson(activeProject);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_flowstudio.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('Exported portable Project + Bible JSON backup!');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-zinc-100">
      <TopBar
        projects={projects}
        activeProject={activeProject}
        onSelectProject={setActiveProjectId}
        onCreateProject={(name) => void handleCreateProject(name)}
        engineSettings={engineSettings}
        colabHealth={colabHealth}
        bibleCount={bible.length}
        vaultMB={vaultMB}
        canInstallPwa={Boolean(installEvent)}
        onInstallPwa={() => {
          if (!installEvent) return;
          void installEvent.prompt();
          setInstallEvent(null);
        }}
        onOpenBible={() => setBibleOpen(true)}
        onOpenScriptImport={() => setScriptOpen(true)}
        onOpenEngine={() => setEngineOpen(true)}
        onExportProjectJson={() => void handleExportProjectJson()}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-16 right-4 z-50 px-3.5 py-2 rounded-xl border border-amber-500/40 bg-zinc-950/95 text-xs text-amber-200 shadow-2xl">
          {toast}
        </div>
      )}

      {/* Main Media Canvas */}
      <main className="flex-1 flex flex-col">
        <MediaGrid
          shots={shots}
          blobUrls={blobUrls}
          onOpenLightbox={(shot) => setLightboxShotId(shot.id)}
          onToggleStoryboard={(shot) => void handleToggleStoryboard(shot)}
          onAnimateStill={(shot) => void handleAnimateStill(shot)}
          onGrabLastFrame={(shot) => void handleGrabLastFrameFromCard(shot)}
          onRemixShot={(shot) => {
            setPrompt(shot.rawPrompt);
            setMode(shot.mode);
            setAspectRatio(shot.aspectRatio);
            showToast(`Loaded ${shot.label} recipe into composer`);
          }}
          onRetryShot={(shot) =>
            void updateShotState({
              ...shot,
              status: 'queued',
              progress: 5,
              phase: 'Retrying...',
              error: undefined,
            })
          }
          onDownloadShot={handleDownloadShot}
          onDeleteShot={(shot) => void handleDeleteShot(shot)}
          onQuickPrompt={(sample) => setPrompt(sample)}
        />
      </main>

      {/* Fix #3: Storyboard Sequence Timeline & Stitcher */}
      <StoryboardBar
        clips={storyboardClips}
        blobUrls={blobUrls}
        projectName={activeProject?.name ?? 'flowstudio'}
        onMoveClip={(id, dir) => void handleMoveStoryboardClip(id, dir)}
        onRemoveClip={(id) => {
          const target = shots.find((s) => s.id === id);
          if (target) void updateShotState({ ...target, storyboardOrder: null });
        }}
        onExportComplete={showToast}
      />

      {/* Docked Google Flow Glassmorphic Composer */}
      <FloatingComposer
        prompt={prompt}
        onPromptChange={setPrompt}
        mode={mode}
        onModeChange={setMode}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        startFrameDataUrl={startFrameDataUrl}
        onStartFrameChange={setStartFrameDataUrl}
        bibleEntries={bible}
        queueCount={activeQueueCount}
        onSubmit={(payload) => void handleQueueSingleShot(payload)}
      />

      {/* Drawers & Modals */}
      <BibleDrawer
        open={bibleOpen}
        projectId={activeProjectId}
        entries={bible}
        onClose={() => setBibleOpen(false)}
        onSaveEntry={async (entry) => {
          await saveBibleEntry(entry);
          setBible((prev) => [...prev, entry].sort((a, b) => a.tag.localeCompare(b.tag)));
          showToast(`Saved ${entry.tag} to Character & Location Bible`);
        }}
        onDeleteEntry={async (id) => {
          await deleteBibleEntry(id);
          setBible((prev) => prev.filter((b) => b.id !== id));
        }}
        onInsertTag={(tag) => {
          const spacer = prompt.trim().length > 0 && !prompt.endsWith(' ') ? ' ' : '';
          setPrompt(`${prompt}${spacer}${tag} `);
        }}
      />

      <ScriptImportModal
        open={scriptOpen}
        onClose={() => setScriptOpen(false)}
        onImportShots={(items) => void handleBulkScriptImport(items)}
      />

      <EngineModal
        open={engineOpen}
        settings={engineSettings}
        colabHealth={colabHealth}
        onClose={() => setEngineOpen(false)}
        onSaveSettings={async (next) => {
          await saveEngineSettings(next);
          setEngineSettings(next);
          showToast(
            next.activeEngine === 'colab-t4'
              ? 'Switched to Free Colab T4 16 GB Engine'
              : 'Switched to Free 24/7 Cloud Engine'
          );
        }}
        onHealthUpdate={setColabHealth}
      />

      <LightboxModal
        shot={lightboxShot}
        mediaUrl={
          lightboxShot
            ? (lightboxShot.blobKey && blobUrls[lightboxShot.blobKey]) ||
              lightboxShot.thumbnailDataUrl
            : undefined
        }
        onClose={() => setLightboxShotId(null)}
        onInjectStartFrame={(dataUrl, sourceLabel) => {
          setStartFrameDataUrl(dataUrl);
          setMode('i2v');
          showToast(`Locked ${sourceLabel} → Start Frame ready for next scene!`);
        }}
        onDownload={handleDownloadShot}
      />
    </div>
  );
}
