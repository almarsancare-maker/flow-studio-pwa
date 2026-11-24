import type {
  AspectRatio,
  BibleEntry,
  CompiledPromptResult,
  GenerationMode,
  ParsedScriptShot,
} from '../types/studio';

export function normalizeTag(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^@+/, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
  return cleaned ? `@${cleaned}` : '';
}

/**
 * Fixes Flow Con #1 (Character & Location Drift):
 * Expands @TAG references in any prompt into locked visual descriptors
 * from the project's Character & Location Bible, and surfaces reference
 * keyframes + locked seeds when defined.
 */
export function compilePromptWithBible(
  rawPrompt: string,
  bibleEntries: BibleEntry[]
): CompiledPromptResult {
  const trimmed = rawPrompt.trim();
  if (!trimmed || bibleEntries.length === 0) {
    return { compiledPrompt: trimmed, appliedTags: [] };
  }

  const tagMap = new Map<string, BibleEntry>();
  for (const entry of bibleEntries) {
    const norm = normalizeTag(entry.tag);
    if (norm) tagMap.set(norm, entry);
  }

  const appliedTags: string[] = [];
  const seen = new Set<string>();
  let suggestedRefImage: string | undefined;
  let suggestedSeed: number | undefined;

  const compiledPrompt = trimmed.replace(/@([A-Za-z0-9_-]+)/g, (match) => {
    const norm = normalizeTag(match);
    const entry = tagMap.get(norm);
    if (!entry) return match;

    if (!seen.has(norm)) {
      seen.add(norm);
      appliedTags.push(norm);
      if (!suggestedRefImage && entry.refImageDataUrl) {
        suggestedRefImage = entry.refImageDataUrl;
      }
      if (suggestedSeed === undefined && typeof entry.lockedSeed === 'number') {
        suggestedSeed = entry.lockedSeed;
      }
    }
    return `${entry.title} (${entry.descriptor.trim()})`;
  });

  return {
    compiledPrompt,
    appliedTags,
    suggestedRefImage,
    suggestedSeed,
  };
}

/**
 * Fixes Flow Con #7 (Manual copy-pasting from multi-scene script kits):
 * Parses multi-line or numbered shot lists (e.g., "S1: ...", "SH02 - ...", "Scene 3: ...")
 * into structured queue items, extracting optional [16:9]/[9:16], [5s]/[10s], and @TAG hints.
 */
export function parseScriptShotList(
  rawText: string,
  defaultMode: GenerationMode = 't2i'
): ParsedScriptShot[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const headerRe = /^(?:[-*•]\s*)?(?:(?:EP\d+[\s_-]*)?(?:S|SH|SCENE|SHOT)\s*0*(\d+[A-Za-z]?)|(\d+)[.)])\s*[:\-—]\s*(.+)$/i;
  const lines = normalized.split('\n');

  const rawShots: { label: string; text: string }[] = [];
  let current: { label: string; text: string } | null = null;
  let explicitHeadersFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current && !explicitHeadersFound) {
        rawShots.push(current);
        current = null;
      }
      continue;
    }

    const match = trimmed.match(headerRe);
    if (match) {
      explicitHeadersFound = true;
      if (current) rawShots.push(current);
      const num = match[1] || match[2];
      const padded = /^\d+$/.test(num) ? num.padStart(2, '0') : num.toUpperCase();
      current = { label: `S${padded}`, text: match[3].trim() };
    } else if (current) {
      current.text = `${current.text} ${trimmed}`.trim();
    } else {
      current = {
        label: `S${String(rawShots.length + 1).padStart(2, '0')}`,
        text: trimmed,
      };
    }
  }
  if (current) rawShots.push(current);

  return rawShots
    .filter((item) => item.text.length > 0)
    .map((item) => {
      let prompt = item.text;
      let aspectRatio: AspectRatio | undefined;
      let durationSec: number | undefined;
      let mode: GenerationMode = defaultMode;

      const arMatch = prompt.match(/\[(16:9|9:16|1:1|21:9)\]/);
      if (arMatch) {
        aspectRatio = arMatch[1] as AspectRatio;
        prompt = prompt.replace(arMatch[0], '').trim();
      }

      const durMatch = prompt.match(/\[(\d{1,2})s\]/i);
      if (durMatch) {
        const secs = Number(durMatch[1]);
        if (secs >= 2 && secs <= 15) durationSec = secs;
        prompt = prompt.replace(durMatch[0], '').trim();
      }

      const modeMatch = prompt.match(/\[(t2i|t2v|i2v|image|video)\]/i);
      if (modeMatch) {
        const token = modeMatch[1].toLowerCase();
        if (token === 'image' || token === 't2i') mode = 't2i';
        else if (token === 'i2v') mode = 'i2v';
        else mode = 't2v';
        prompt = prompt.replace(modeMatch[0], '').trim();
      }

      let subtitle: string | undefined;
      const subMatch = prompt.match(/\[sub:\s*["']?([^\]"']+)["']?\s*\]/i);
      if (subMatch) {
        subtitle = subMatch[1].trim();
        prompt = prompt.replace(subMatch[0], '').trim();
      }

      const detectedTags = Array.from(
        new Set((prompt.match(/@[A-Za-z0-9_-]+/g) || []).map((t) => normalizeTag(t)))
      );

      return {
        label: item.label,
        prompt: prompt.replace(/\s{2,}/g, ' ').trim(),
        aspectRatio,
        durationSec,
        mode,
        subtitle,
        detectedTags,
      };
    });
}
