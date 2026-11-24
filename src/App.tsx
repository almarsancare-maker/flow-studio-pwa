import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteBibleEntry,
  deleteBlob,
  deleteShot,
  exportProjectManifestJson,
  getVaultUsageBytes,
  importProjectManifestJson,
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
  fetchServerCapabilities,
  pingColabBackend,
  runImageGeneration,
  runVideoGeneration,
  synthesizeSyncedVideoAudio,
  type ColabHealthStatus,
  type ServerKeyCapabilities,
} from './services/engine';
import { TopBar } from './components/TopBar';
import { BibleDrawer } from './components/BibleDrawer';
import {
  FloatingComposer,
  type ComposerSubmitPayload,
  type RemixRecipePayload,
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
  const [serverKeys, setServerKeys] = useState<ServerKeyCapabilities>({
    gemini: false,
    replicate: false,
    fal: false,
  });
  const [vaultMB, setVaultMB] = useState(0);

  // Composer controlled state
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<GenerationMode>('t2i');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [startFrameDataUrl, setStartFrameDataUrl] = useState<string | undefined>(undefined);
  const [endFrameDataUrl, setEndFrameDataUrl] = useState<string | undefined>(undefined);
  const [remixRecipe, setRemixRecipe] = useState<RemixRecipePayload | null>(null);

  // Drawers / Modals / Toast
  const [bibleOpen, setBibleOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [lightboxShotId, setLightboxShotId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const processingRef = useRef(false);
  const deletedShotIdsRef = useRef<Set<string>>(new Set());
  const nextLabelCounterRef = useRef(1);
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
    void Promise.all([ensureVaultBootstrapped(), fetchServerCapabilities()]).then(
      async ([{ projects: loadedProjects, settings: loadedSettings }, caps]) => {
        if (!active) return;
        setServerKeys(caps);
        // Always default to 100% Free 24/7 Cloud ($0 Wan 2.2 14B + FLUX Cascade) unless user explicitly picks another engine
        setEngineSettings(loadedSettings);
        setProjects(loadedProjects);
        const savedId = window.localStorage.getItem('flowstudio_active_project');
        const matched = loadedProjects.find((p) => p.id === savedId);
        setActiveProjectId(matched ? matched.id : loadedProjects[0].id);
        if (loadedSettings.activeEngine === 'colab-t4' && loadedSettings.colabUrl.trim()) {
          void pingColabBackend(loadedSettings.colabUrl).then((health) => {
            if (active) setColabHealth(health);
          });
        }
        await refreshVaultUsage();
      }
    );
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

  // Load project Bible + Shots whenever activeProjectId changes, recovering any interrupted renders
  useEffect(() => {
    if (!activeProjectId) return;
    void Promise.all([listProjectBible(activeProjectId), listProjectShots(activeProjectId)]).then(
      async ([bList, sList]) => {
        setBible(bList);
        const recovered: MediaShot[] = [];
        for (const shot of sList) {
          if (shot.status === 'processing' && !processingRef.current) {
            const fixed: MediaShot = {
              ...shot,
              status: 'failed',
              progress: 0,
              phase: 'Interrupted',
              error: 'Render interrupted by page reload — click Retry.',
            };
            await saveShot(fixed);
            recovered.push(fixed);
          } else {
            recovered.push(shot);
          }
        }
        let maxNum = 0;
        for (const s of recovered) {
          const m = /^S0*(\d+)$/i.exec(s.label);
          if (m) maxNum = Math.max(maxNum, Number(m[1]));
        }
        nextLabelCounterRef.current = Math.max(maxNum + 1, recovered.length + 1);
        setShots(recovered);
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
    if (deletedShotIdsRef.current.has(updated.id)) return;
    await saveShot(updated);
    if (deletedShotIdsRef.current.has(updated.id)) return;
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
        if (deletedShotIdsRef.current.has(current.id)) return;
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
          omniInteractionId: result.omniInteractionId ?? current.omniInteractionId,
          hasSyncedAudio: result.hasSyncedAudio ?? current.hasSyncedAudio,
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

  const nextShotLabel = (): string => {
    const n = nextLabelCounterRef.current;
    nextLabelCounterRef.current += 1;
    return `S${String(n).padStart(2, '0')}`;
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
    const takeCount = payload.takeCount || 1;
    const baseTime = Date.now();
    const refImgs = bible
      .filter((b) => compiled.appliedTags.includes(b.tag) && b.refImageDataUrl)
      .map((b) => b.refImageDataUrl as string)
      .slice(0, 4);

    const created: MediaShot[] = [];
    for (let i = 0; i < takeCount; i++) {
      const shotSeed = i === 0 ? payload.seed : (payload.seed + i * 7919) % 2_000_000_000;
      const newShot: MediaShot = {
        id: makeId(`shot${i}`),
        projectId: activeProjectId,
        label: nextShotLabel(),
        kind,
        mode: payload.mode,
        status: 'queued',
        progress: 5,
        phase: takeCount > 1 ? `Queued Take ${i + 1}/${takeCount}...` : 'Queued...',
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
        seed: shotSeed,
        engine: engineSettings.activeEngine,
        model:
          engineSettings.activeEngine === 'gemini-omni'
            ? kind === 'image'
              ? `Free ${engineSettings.freeImageModel.toUpperCase()} ($0 Keyframe)`
              : `Gemini Omni 1.2 (${engineSettings.omniResolution})`
            : engineSettings.activeEngine === 'seedance-byok'
            ? kind === 'image'
              ? `Free ${engineSettings.freeImageModel.toUpperCase()} ($0 Keyframe)`
              : `Seedance (${engineSettings.seedanceResolution})`
            : engineSettings.activeEngine === 'colab-t4'
            ? kind === 'image'
              ? engineSettings.colabModelImage
              : engineSettings.colabModelVideo
            : kind === 'image'
            ? `Free ${engineSettings.freeImageModel.toUpperCase()}`
            : 'Free 24/7 Video',
        startFrameDataUrl: payload.startFrameDataUrl,
        endFrameDataUrl: payload.endFrameDataUrl,
        referenceImages: refImgs,
        storyboardOrder: null,
        createdAt: baseTime + i,
      };
      await saveShot(newShot);
      created.push(newShot);
    }

    setShots((prev) => [...created.reverse(), ...prev]);
    setPrompt('');
    if (payload.mode === 'i2v') {
      setStartFrameDataUrl(undefined);
      setEndFrameDataUrl(undefined);
    }
    showToast(
      takeCount > 1
        ? `Queued ${takeCount}× ${kind.toUpperCase()} takes (${created.map((c) => c.label).join(', ')})`
        : `Queued ${created[0].label} (${kind.toUpperCase()})`
    );
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
        label: item.label || nextShotLabel(),
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
        subtitle: item.subtitle,
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

  const handleDownloadShot = async (shot: MediaShot) => {
    const url = (shot.blobKey && blobUrls[shot.blobKey]) || shot.thumbnailDataUrl;
    if (!url) return;
    let ext = shot.kind === 'video' ? 'mp4' : 'png';
    if (shot.blobKey) {
      const blob = await loadBlob(shot.blobKey);
      const mime = (blob?.type || '').toLowerCase();
      if (mime.includes('webm')) ext = 'webm';
      else if (mime.includes('mp4')) ext = 'mp4';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('png')) ext = 'png';
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${shot.label.toLowerCase()}_seed${shot.seed}.${ext}`;
    a.click();
  };

  const handleReorderStoryboardClips = async (fromId: string, toId: string) => {
    const ordered = [...storyboardClips];
    const fromIdx = ordered.findIndex((c) => c.id === fromId);
    const toIdx = ordered.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    await Promise.all(
      ordered.map((clip, i) => updateShotState({ ...clip, storyboardOrder: i + 1 }))
    );
  };

  const handleExtendFinalClip = async (clip: MediaShot) => {
    if (clip.kind === 'video') {
      await handleGrabLastFrameFromCard(clip);
    } else {
      await handleAnimateStill(clip);
    }
  };

  const handleRetryAllFailed = async () => {
    const failed = shots.filter((s) => s.status === 'failed');
    if (failed.length === 0) return;
    for (const s of failed) {
      await updateShotState({
        ...s,
        status: 'queued',
        progress: 5,
        phase: 'Retrying...',
        error: undefined,
      });
    }
    showToast(`Re-queued ${failed.length} failed ${failed.length === 1 ? 'shot' : 'shots'}`);
  };

  const handleOmniTurn = async (
    sourceShot: MediaShot,
    turnPrompt: string,
    turnAction: 'edit' | 'extend'
  ) => {
    if (!activeProjectId || !sourceShot.omniInteractionId) return;
    const compiled = compilePromptWithBible(turnPrompt, bible);
    const turnShot: MediaShot = {
      id: makeId('omni'),
      projectId: activeProjectId,
      label: nextShotLabel(),
      kind: 'video',
      mode: 't2v',
      status: 'queued',
      progress: 5,
      phase: `Queued Omni ${turnAction}...`,
      rawPrompt: turnPrompt,
      compiledPrompt: compiled.compiledPrompt,
      negativePrompt: sourceShot.negativePrompt,
      appliedTags: compiled.appliedTags,
      aspectRatio: sourceShot.aspectRatio,
      width: sourceShot.width,
      height: sourceShot.height,
      durationSec: turnAction === 'extend' ? 10 : Math.min(sourceShot.durationSec, 15),
      fps: 24,
      steps: 24,
      cfgScale: 6.5,
      seed: sourceShot.seed,
      engine: 'gemini-omni',
      model: `Gemini Omni 1.2 (${turnAction === 'extend' ? '+10s Extend' : 'Edit Turn'})`,
      previousOmniInteractionId: sourceShot.omniInteractionId,
      omniTurnAction: turnAction,
      storyboardOrder: null,
      createdAt: Date.now(),
    };
    await saveShot(turnShot);
    setShots((prev) => [turnShot, ...prev]);
    showToast(`Queued Omni 1.2 ${turnAction} turn as ${turnShot.label}`);
  };

  const handleFreeDirectorTurn = async (
    sourceShot: MediaShot,
    turnPrompt: string,
    turnAction: 'edit' | 'extend',
    frameDataUrl?: string
  ) => {
    if (!activeProjectId) return;
    const isExtend = turnAction === 'extend';
    const nextKind: 'image' | 'video' = isExtend || sourceShot.kind === 'video' ? 'video' : 'image';
    const nextMode: GenerationMode = nextKind === 'video' ? 'i2v' : 't2i';

    // Preserve any Bible @TAGs from original shot when user writes a short edit directive
    const missingTags = sourceShot.appliedTags.filter(
      (t) => !turnPrompt.toUpperCase().includes(t.toUpperCase())
    );
    const mergedRaw =
      nextKind === 'image'
        ? `${sourceShot.rawPrompt}, ${turnPrompt}`
        : missingTags.length > 0
        ? `${turnPrompt} (${missingTags.join(' ')})`
        : turnPrompt;
    const compiled = compilePromptWithBible(mergedRaw, bible);
    const [width, height] = ASPECT_DIMENSIONS[sourceShot.aspectRatio][nextKind];

    // On +5s Extend Chain, auto-place both source & continuation into Storyboard Cut for seamless 15s–30s playback!
    let nextStoryboardOrder: number | null = null;
    if (isExtend) {
      let maxOrder =
        storyboardClips.length > 0
          ? Math.max(...storyboardClips.map((c) => c.storyboardOrder ?? 0))
          : 0;
      if (sourceShot.storyboardOrder === null) {
        maxOrder += 1;
        await updateShotState({ ...sourceShot, storyboardOrder: maxOrder });
      }
      nextStoryboardOrder = maxOrder + 1;
    }

    let startFrame = frameDataUrl;
    if (nextKind === 'video' && !startFrame && sourceShot.blobKey) {
      const blob = await loadBlob(sourceShot.blobKey);
      if (blob && sourceShot.kind === 'image') {
        startFrame = await blobToDataUrl(blob);
      }
    }

    const turnShot: MediaShot = {
      id: makeId('turn'),
      projectId: activeProjectId,
      label: nextShotLabel(),
      kind: nextKind,
      mode: nextMode,
      status: 'queued',
      progress: 5,
      phase: isExtend ? 'Queued +5s Free Extend Chain...' : 'Queued $0 Director Edit...',
      rawPrompt: mergedRaw,
      compiledPrompt: compiled.compiledPrompt,
      negativePrompt: sourceShot.negativePrompt,
      appliedTags: compiled.appliedTags,
      aspectRatio: sourceShot.aspectRatio,
      width,
      height,
      durationSec: isExtend ? 5 : sourceShot.durationSec,
      fps: 24,
      steps: sourceShot.steps,
      cfgScale: sourceShot.cfgScale,
      seed: isExtend ? sourceShot.seed : (sourceShot.seed + 1337) % 2_000_000_000,
      engine: engineSettings.activeEngine,
      model:
        nextKind === 'video'
          ? isExtend
            ? 'Free Wan 2.2 / LTX (+5s Chain)'
            : 'Free Wan 2.2 / LTX (Re-Direct)'
          : `Free ${engineSettings.freeImageModel.toUpperCase()} (Edit Turn)`,
      startFrameDataUrl: nextKind === 'video' ? startFrame : undefined,
      parentShotId: sourceShot.id,
      storyboardOrder: nextStoryboardOrder,
      createdAt: Date.now(),
    };
    await saveShot(turnShot);
    setShots((prev) => [turnShot, ...prev]);
    showToast(
      isExtend
        ? `Chained ${turnShot.label} (+5s $0 Extend) directly into Storyboard Cut!`
        : `Queued $0 Director Edit as ${turnShot.label}`
    );
  };

  const handleSyncFreeFoley = async (shot: MediaShot) => {
    if (!shot.blobKey) throw new Error('Video blob not found in local Vault');
    const existingBlob = await loadBlob(shot.blobKey);
    if (!existingBlob) throw new Error('Could not load video from local Vault');

    const synced = await synthesizeSyncedVideoAudio(
      existingBlob,
      shot.rawPrompt || shot.compiledPrompt,
      shot.durationSec,
      shot.seed
    );

    const newBlobKey = `blob_${shot.id}_foley_${Date.now()}`;
    await saveBlob(newBlobKey, synced.blob);
    const oldKey = shot.blobKey;
    const objUrl = URL.createObjectURL(synced.blob);
    blobUrlsRef.current = { ...blobUrlsRef.current, [newBlobKey]: objUrl };
    setBlobUrls({ ...blobUrlsRef.current });

    const updated: MediaShot = {
      ...shot,
      blobKey: newBlobKey,
      hasSyncedAudio: true,
      model: shot.model.includes('MMAudio') ? shot.model : `${shot.model} + MMAudio Foley`,
    };
    await updateShotState(updated);
    if (oldKey && oldKey !== newBlobKey) {
      await deleteBlob(oldKey);
      if (blobUrlsRef.current[oldKey]) {
        URL.revokeObjectURL(blobUrlsRef.current[oldKey]);
      }
    }
    await refreshVaultUsage();
    showToast(`Synced frame-accurate AI Foley audio onto ${shot.label} ($0)!`);
  };

  const handleDeleteShot = async (shot: MediaShot) => {
    deletedShotIdsRef.current.add(shot.id);
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

  const handleImportProjectJson = async (rawJson: string) => {
    try {
      const res = await importProjectManifestJson(rawJson);
      setProjects((prev) => [res.project, ...prev]);
      setActiveProjectId(res.project.id);
      showToast(
        `Imported "${res.project.name}" (${res.bibleCount} Bible tags, ${res.shotCount} shots)`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Invalid project backup JSON');
    }
  };

  return (
    <div
      data-testid="flow-app-shell"
      className="flow-shell flex flex-col"
    >
      <TopBar
        projects={projects}
        activeProject={activeProject}
        onSelectProject={setActiveProjectId}
        onCreateProject={(name) => void handleCreateProject(name)}
        engineSettings={engineSettings}
        colabHealth={colabHealth}
        serverKeys={serverKeys}
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
        onImportProjectJson={(raw) => void handleImportProjectJson(raw)}
      />

      {/* Toast Notification (Monochrome Flow Glass Pill — never occludes header or composer) */}
      {toast && (
        <button
          type="button"
          onClick={() => setToast(null)}
          className="fixed bottom-5 right-5 z-[1100] px-4 py-2.5 rounded-[32px] border border-white/25 bg-[#131314]/95 text-[13px] font-medium text-white shadow-[0_16px_32px_-8px_rgba(0,0,0,0.65)] backdrop-blur-xl max-w-[90vw] truncate hover:border-white/40 transition cursor-pointer"
        >
          {toast}
        </button>
      )}

      {/* Main Media Canvas */}
      <main data-testid="flow-main-canvas" className="flex-1 flex flex-col">
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
            setRemixRecipe({
              nonce: Date.now(),
              negativePrompt: shot.negativePrompt,
              seed: shot.seed,
              steps: shot.steps,
              cfgScale: shot.cfgScale,
              durationSec: shot.durationSec,
            });
            showToast(`Loaded ${shot.label} full recipe (seed ${shot.seed} locked) into composer`);
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
          onRetryAllFailed={() => void handleRetryAllFailed()}
          onCancelShot={(shot) => void handleDeleteShot(shot)}
          onDownloadShot={(shot) => void handleDownloadShot(shot)}
          onDeleteShot={(shot) => void handleDeleteShot(shot)}
          onQuickPrompt={(sample, targetMode) => {
            setPrompt(sample);
            if (targetMode) setMode(targetMode);
          }}
        />
      </main>

      {/* Unified Bottom Cinema Dock */}
      <div className="md:sticky md:bottom-0 z-30 pt-3 flow-bottom-dock">
        <StoryboardBar
          clips={storyboardClips}
          blobUrls={blobUrls}
          projectName={activeProject?.name ?? 'flowstudio'}
          onMoveClip={(id, dir) => void handleMoveStoryboardClip(id, dir)}
          onReorderClips={(fromId, toId) => void handleReorderStoryboardClips(fromId, toId)}
          onRemoveClip={(id) => {
            const target = shots.find((s) => s.id === id);
            if (target) void updateShotState({ ...target, storyboardOrder: null });
          }}
          onExtendFinalClip={(clip) => void handleExtendFinalClip(clip)}
          onExportComplete={showToast}
        />

        <FloatingComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          mode={mode}
          onModeChange={setMode}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          startFrameDataUrl={startFrameDataUrl}
          onStartFrameChange={setStartFrameDataUrl}
          endFrameDataUrl={endFrameDataUrl}
          onEndFrameChange={setEndFrameDataUrl}
          remixRecipe={remixRecipe}
          engineSettings={engineSettings}
          bibleEntries={bible}
          queueCount={activeQueueCount}
          onSubmit={(payload) => void handleQueueSingleShot(payload)}
        />
      </div>

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
        bibleEntries={bible}
        onClose={() => setScriptOpen(false)}
        onImportShots={(items) => void handleBulkScriptImport(items)}
      />

      <EngineModal
        open={engineOpen}
        settings={engineSettings}
        colabHealth={colabHealth}
        serverKeys={serverKeys}
        onClose={() => setEngineOpen(false)}
        onSaveSettings={async (next) => {
          window.localStorage.setItem('cabardo_engine_user_set', '1');
          await saveEngineSettings(next);
          setEngineSettings(next);
          showToast(
            next.activeEngine === 'gemini-omni'
              ? `Switched to Google Gemini Omni 1.2 Flash (${next.omniResolution})`
              : next.activeEngine === 'seedance-byok'
              ? 'Switched to Official Seedance 2.5 (BYOK — Keyframes stay $0!)'
              : next.activeEngine === 'colab-t4'
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
        onInjectEndFrame={(dataUrl, sourceLabel) => {
          setEndFrameDataUrl(dataUrl);
          setMode('i2v');
          showToast(`Locked ${sourceLabel} → End Frame interpolation ready!`);
        }}
        onUpdateSubtitle={(shot, subtitle) => {
          void updateShotState({ ...shot, subtitle });
        }}
        onOmniTurn={(shot, turnPrompt, turnAction) =>
          void handleOmniTurn(shot, turnPrompt, turnAction)
        }
        onFreeDirectorTurn={(shot, turnPrompt, turnAction, frameDataUrl) =>
          void handleFreeDirectorTurn(shot, turnPrompt, turnAction, frameDataUrl)
        }
        onSyncFreeFoley={(shot) => handleSyncFreeFoley(shot)}
        onDownload={(shot) => void handleDownloadShot(shot)}
      />
    </div>
  );
}
