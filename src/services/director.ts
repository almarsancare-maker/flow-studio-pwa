import type { GenerationMode } from '../types/studio';

export async function enhancePromptWithDirector(
  prompt: string,
  mode: GenerationMode
): Promise<{ enhanced: string; provider: string }> {
  const resp = await fetch('/api/director', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'enhance', prompt, mode }),
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok || !data?.enhanced) {
    throw new Error(data?.error || 'Could not enhance prompt');
  }
  return { enhanced: data.enhanced, provider: data.provider || 'AI Director' };
}

export async function generateScriptWithDirector(
  premise: string,
  tags: string[],
  shotCount = 4
): Promise<{ script: string; provider: string }> {
  const resp = await fetch('/api/director', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'script', premise, tags, shotCount }),
  });
  const data = await resp.json();
  if (!resp.ok || !data?.ok || !data?.script) {
    throw new Error(data?.error || 'Could not generate script');
  }
  return { script: data.script, provider: data.provider || 'AI Director' };
}
