export type FreeImageModel = 'flux' | 'flux-dev' | 'sd35-turbo' | 'turbo';
export type GenerationMode = 't2i' | 't2v' | 'i2v';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '21:9';
export type EngineId = 'free-24-7' | 'colab-t4' | 'gemini-omni' | 'seedance-byok';
export type OmniResolution = '360p' | '720p' | '1080p' | '4k';
export type SeedanceProvider = 'replicate' | 'fal';
export type SeedanceResolution = '480p' | '720p' | '1080p';
export type CinemaLut = 'natural' | 'teal-orange' | 'warm-35mm' | 'noir-bw' | 'cyberpunk';
export type TransitionStyle = 'cut' | 'crossfade' | 'fade-black';
export type AmbientAudioPreset = 'none' | 'tropical-rain' | 'neon-drone' | 'warm-cinema';
export type BibleCategory = 'character' | 'location' | 'prop' | 'style';
export type ShotStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Project {
  id: string;
  name: string;
  description: string;
  aspectRatio: AspectRatio;
  createdAt: number;
  updatedAt: number;
}

export interface BibleEntry {
  id: string;
  projectId: string;
  tag: string; // e.g., "@MIRA", "@LOC-D"
  category: BibleCategory;
  title: string;
  descriptor: string;
  lockedSeed?: number;
  refImageDataUrl?: string;
  createdAt: number;
}

export interface MediaShot {
  id: string;
  projectId: string;
  label: string; // e.g., "S01"
  kind: 'image' | 'video';
  mode: GenerationMode;
  status: ShotStatus;
  progress: number;
  phase: string;
  rawPrompt: string;
  compiledPrompt: string;
  negativePrompt: string;
  appliedTags: string[];
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  steps: number;
  cfgScale: number;
  seed: number;
  engine: EngineId;
  model: string;
  remoteUrl?: string;
  blobKey?: string;
  thumbnailDataUrl?: string;
  startFrameDataUrl?: string;
  endFrameDataUrl?: string;
  referenceImages?: string[];
  subtitle?: string;
  externalTaskId?: string;
  omniInteractionId?: string;
  previousOmniInteractionId?: string;
  omniTurnAction?: 'edit' | 'extend';
  parentShotId?: string;
  hasSyncedAudio?: boolean;
  storyboardOrder: number | null;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface EngineSettings {
  activeEngine: EngineId;
  hfToken: string;
  colabUrl: string;
  colabModelImage: 'sdxl-turbo' | 'sdxl-base';
  colabModelVideo: 'wan2.2-5b' | 'ltx-0.9.7-distilled' | 'cogvideox-2b' | 'ltx-video' | 'wan2.1-1.3b';
  colabAudio: boolean;
  freeImageModel: FreeImageModel;
  freeVideoFallback: 'hf-ltx-space' | 'ken-burns-local';
  freeAutoAudio: boolean;
  geminiApiKey: string;
  omniResolution: OmniResolution;
  seedanceProvider: SeedanceProvider;
  seedanceApiKey: string;
  seedanceModel: string;
  seedanceResolution: SeedanceResolution;
  seedanceAudio: boolean;
  autoSaveToVault: boolean;
}

export interface CompiledPromptResult {
  compiledPrompt: string;
  appliedTags: string[];
  suggestedRefImage?: string;
  suggestedSeed?: number;
}

export interface ParsedScriptShot {
  label: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  durationSec?: number;
  mode: GenerationMode;
  subtitle?: string;
  detectedTags: string[];
}

export const ASPECT_DIMENSIONS: Record<AspectRatio, { image: [number, number]; video: [number, number] }> = {
  '16:9': { image: [1024, 576], video: [720, 480] },
  '9:16': { image: [576, 1024], video: [480, 720] },
  '1:1': { image: [1024, 1024], video: [512, 512] },
  '21:9': { image: [1152, 496], video: [768, 336] },
};

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  activeEngine: 'free-24-7',
  hfToken: '',
  colabUrl: '',
  colabModelImage: 'sdxl-turbo',
  colabModelVideo: 'wan2.2-5b',
  colabAudio: true,
  freeImageModel: 'flux',
  freeVideoFallback: 'hf-ltx-space',
  freeAutoAudio: true,
  geminiApiKey: '',
  omniResolution: '720p',
  seedanceProvider: 'replicate',
  seedanceApiKey: '',
  seedanceModel: 'bytedance/seedance-2.5',
  seedanceResolution: '720p',
  seedanceAudio: true,
  autoSaveToVault: true,
};
