import { setCorsHeaders } from './_ssrf.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  fetchWithAbort,
  readJsonBodySafe,
} from './_rateLimit.js';

/**
 * Free ($0) AI Cinema Prompt Enhancer & Multi-Scene Film Script Director.
 * Uses public text.pollinations.ai with instant deterministic local director fallback.
 */

function localEnhancePrompt(prompt, mode) {
  const clean = prompt.trim();
  const motion =
    mode === 't2i'
      ? 'shot on 35mm Kodak Vision3 film, subtle volumetric lighting, shallow depth of field, rich skin texture, natural film grain, cinema color grading'
      : 'smooth cinematic slow dolly-in, realistic natural motion physics, atmospheric lighting, 35mm cinema lens, fluid camera choreography, subtle film grain';
  return `${clean}, ${motion}`;
}

function localGenerateScript(premise, tags) {
  const lead = tags[0] || '@MIRA';
  const loc = tags[1] || '@LOC-D';
  const p = premise.trim();
  return [
    `S1: [16:9] [image] Wide establishing shot of ${loc} setting the mood for: ${p}, atmospheric volumetric light, 35mm cinema still [sub: "It started on a night nobody would forget."]`,
    `S2: [16:9] [5s] [t2v] Slow dolly-in on ${lead} inside ${loc}, subtle emotional expression reacting to ${p}, shallow depth of field [sub: "Every detail was right in front of me."]`,
    `S3: [16:9] [5s] [t2v] Close-up handheld camera tracking ${lead}'s hands and eyes in dramatic key light, cinematic tension [sub: "There was no turning back now."]`,
    `S4: [16:9] [5s] [t2v] Sweeping crane shot rising above ${lead} inside ${loc}, rain reflections and warm amber rim light [sub: "And everything changed in an instant."]`,
  ].join('\n');
}

async function callPollinationsText(systemPrompt, userPrompt) {
  const resp = await fetchWithAbort(
    'https://text.pollinations.ai/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CabardoStudio/1.0',
      },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    },
    18_000
  );
  if (!resp.ok) throw new Error(`Pollinations text HTTP ${resp.status}`);
  const text = (await resp.text()).trim();
  if (!text || text.length < 12) throw new Error('Empty director output');
  return text;
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const rl = checkRateLimit(req, { keyPrefix: 'director', maxRequests: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.` });
  }

  try {
    const body = await readJsonBodySafe(req, 32_000);
    const action = String(body.action || '');

    if (action === 'enhance') {
      const prompt = String(body.prompt || '').trim();
      const mode = String(body.mode || 't2i');
      if (!prompt) return res.status(400).json({ ok: false, error: 'Prompt is required.' });
      if (prompt.length > 2000) {
        return res.status(400).json({ ok: false, error: 'Prompt too long to enhance.' });
      }

      const sys =
        mode === 't2i'
          ? 'You are an award-winning Hollywood cinematographer. Rewrite the user prompt into ONE concise, vivid 35mm photography/film-still prompt (under 65 words) with lighting, lens, framing, and mood. CRITICAL: Keep every @TAG token (like @MIRA or @LOC-D) intact verbatim. Output ONLY the enhanced prompt, no quotes or commentary.'
          : 'You are an award-winning Hollywood film director. Rewrite the user prompt into ONE concise, vivid AI video prompt (under 65 words) with camera movement, subject motion, lighting, and atmosphere. CRITICAL: Keep every @TAG token (like @MIRA or @LOC-D) intact verbatim. Output ONLY the enhanced prompt, no quotes or commentary.';

      try {
        const enhanced = await callPollinationsText(sys, prompt);
        return res.status(200).json({
          ok: true,
          provider: 'AI Cinema Director ($0)',
          enhanced: enhanced.replace(/^["']|["']$/g, '').trim(),
        });
      } catch {
        return res.status(200).json({
          ok: true,
          provider: 'Instant Local Director ($0)',
          enhanced: localEnhancePrompt(prompt, mode),
        });
      }
    }

    if (action === 'script') {
      const premise = String(body.premise || '').trim();
      const tags = Array.isArray(body.tags)
        ? body.tags.filter((t) => typeof t === 'string' && t.startsWith('@')).slice(0, 8)
        : [];
      const shotCount = Math.max(3, Math.min(6, Number(body.shotCount) || 4));
      if (!premise) return res.status(400).json({ ok: false, error: 'Enter a story idea first.' });

      const tagHint = tags.length > 0 ? `Available Bible tags to use naturally: ${tags.join(', ')}.` : '';
      const sys =
        `You are a film director creating a ${shotCount}-shot storyboard script. ` +
        `Output EXACTLY ${shotCount} lines, each formatted strictly as:\n` +
        `S1: [16:9] [image] <vivid visual shot description> [sub: "<short 5-10 word cinema subtitle>"]\n` +
        `Use [image] for Shot 1 (establishing keyframe) and [5s] [t2v] for Shots 2..${shotCount}. ${tagHint} ` +
        `Output ONLY the S1..S${shotCount} lines, no intro or markdown fences.`;

      try {
        const script = await callPollinationsText(sys, premise);
        const cleaned = script
          .replace(/^```[a-z]*\n?/i, '')
          .replace(/\n?```$/i, '')
          .trim();
        return res.status(200).json({
          ok: true,
          provider: 'AI Script Director ($0)',
          script: /^S\d+:/im.test(cleaned) ? cleaned : localGenerateScript(premise, tags),
        });
      } catch {
        return res.status(200).json({
          ok: true,
          provider: 'Instant Script Template ($0)',
          script: localGenerateScript(premise, tags),
        });
      }
    }

    return res.status(400).json({ ok: false, error: `Unknown director action: ${action}` });
  } catch (err) {
    return res
      .status(err?.statusCode || 500)
      .json({ ok: false, error: err?.message || 'Director error' });
  }
}
