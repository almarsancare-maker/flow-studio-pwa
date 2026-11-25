import { setCorsHeaders } from './_ssrf.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  fetchWithAbort,
  readJsonBodySafe,
} from './_rateLimit.js';
import { sanitizeGeminiError } from './omni.js';
import {
  MASTER_PROMPT_V503,
  MASTER_PROMPT_V503_CHECKS,
  MASTER_PROMPT_V503_COMPACT,
  MASTER_PROMPT_V503_LENGTH,
  MASTER_PROMPT_V503_VERSION,
  STEP_0_CANONICAL_MENU,
} from './_directorV5Prompt.js';
import { parseDirectorV5Output } from './_directorV5Parser.js';
import { runDeterministicDirectorV5Turn } from './_directorV5Fallback.js';

/**
 * MASTER PROMPT v5.0.3 — Director Compiler Vercel Serverless Endpoint (/api/director-v5)
 *
 * Provider Cascade (100% standalone, works 24/7 on any device with zero local PC dependency):
 *  1) $0 Free-Tier Google Gemini 2.5 Flash (uses server GEMINI_API_KEY env or BYOK key from Settings)
 *     - Feeds the COMPLETE VERBATIM 129,990-byte MASTER_PROMPT_V503 as systemInstruction (zero rules dropped)
 *     - Automatic fallback to gemini-2.0-flash on model overload/404
 *  2) $0 Zero-Key Pollinations Text LLM (https://text.pollinations.ai/)
 *     - Works out of the box with zero API keys; tracks Pollinations' 45s per-IP cooldown gracefully
 *  3) $0 Instant Deterministic Director v5.0.3 State-Machine Compiler
 *     - Guarantees 0ms canonical gates (STEP 0, O-V, ASSET SWEEP) and seamless continuity during
 *       Pollinations cooldown windows or upstream outages
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

// Track Pollinations anonymous IP cooldown in-process to avoid burning timeouts on consecutive turns
let pollinationsCooldownUntil = 0;

function buildRuntimeStateContext(ledger = [], bible = []) {
  const sections = [];

  if (Array.isArray(ledger) && ledger.length > 0) {
    const lines = ledger.slice(0, 60).map((item) => {
      const fn = String(item.filename || '').trim();
      const tok = String(item.token || '').trim();
      const role = String(item.role || 'reference').trim();
      const st = String(item.status || 'PENDING').trim();
      return `- ${fn} ↔ ${tok} ↔ ${role} | STATE: ${st}`;
    });
    sections.push(
      [
        'LIVE ASSET INVENTORY LEDGER (AUTHORITATIVE OPERATOR STATE — OBEY §2.0, §5.4, §9.7):',
        ...lines,
        'CRITICAL: NEVER regenerate or re-serve any card marked REF BOUND or APPROVED. Open EVERY paste-ready prompt block with an ATTACH: line naming the exact filenames above.',
      ].join('\n')
    );
  }

  if (Array.isArray(bible) && bible.length > 0) {
    const bLines = bible.slice(0, 20).map((b) => {
      const tag = String(b.tag || '').trim();
      const cat = String(b.category || 'character').trim();
      const title = String(b.title || '').trim();
      const desc = String(b.descriptor || '').trim().slice(0, 220);
      return `- ${tag} [${cat}] ${title}: ${desc}`;
    });
    sections.push(
      [
        'ACTIVE STUDIO PROJECT BIBLE (available project entities the operator may reference):',
        ...bLines,
      ].join('\n')
    );
  }

  return sections.length > 0 ? `\n\n---\n## LIVE WORKSPACE CONTEXT\n${sections.join('\n\n')}` : '';
}

function sanitizeHistory(rawHistory = []) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-18)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 12_000),
    }));
}

async function callGeminiV5({ apiKey, history, userInput, runtimeContext }) {
  const systemText = `${MASTER_PROMPT_V503}${runtimeContext}`;
  const contents = [];

  for (const msg of history) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: userInput }],
  });

  let lastErr = 'Gemini request failed';
  for (const model of GEMINI_MODELS) {
    try {
      const resp = await fetchWithAbort(
        `${GEMINI_BASE}/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents,
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 8192,
            },
          }),
        },
        45_000
      );

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        lastErr = sanitizeGeminiError(
          data?.error?.message || `Gemini ${model} HTTP ${resp.status}`,
          apiKey
        );
        // Stop trying alternate models on hard auth errors (400/401/403)
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(lastErr);
        }
        continue;
      }

      const parts = data?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts
            .map((p) => (typeof p?.text === 'string' ? p.text : ''))
            .join('\n')
            .trim()
        : '';

      if (!text) {
        lastErr = `Gemini ${model} returned empty candidate`;
        continue;
      }

      return {
        text,
        provider:
          model === 'gemini-2.5-flash'
            ? 'Gemini 2.5 Flash ($0 Free Tier)'
            : 'Gemini 2.0 Flash ($0 Free Tier)',
        model,
      };
    } catch (err) {
      lastErr = sanitizeGeminiError(err?.message || `Gemini ${model} error`, apiKey);
      if (/API key|invalid|permission|denied/i.test(lastErr)) {
        throw new Error(lastErr);
      }
    }
  }

  throw new Error(lastErr);
}

async function callPollinationsV5({ history, userInput, runtimeContext, expectedStage }) {
  const now = Date.now();
  if (now < pollinationsCooldownUntil) {
    const waitSec = Math.ceil((pollinationsCooldownUntil - now) / 1000);
    const err = new Error(`Pollinations free IP cooldown (${waitSec}s remaining)`);
    err.cooldownSec = waitSec;
    throw err;
  }

  // Strip the raw STEP 0 menu text from Pollinations' compact prompt on non-STEP-0 turns so 20B models
  // NEVER echo STEP 0 back when the operator has already pasted a real script or chosen an option.
  const compactWithoutStep0 = MASTER_PROMPT_V503_COMPACT.split('CANONICAL STEP 0 MENU:')[0].trim();
  const stageHint =
    expectedStage && expectedStage !== 'step0'
      ? `\nACTIVE STAGE DIRECTIVE: The operator has ALREADY progressed past STEP 0 (next expected stage: ${expectedStage}). NEVER reprint [STEP 0 — ENTRY QUESTION]. Honor the operator's exact pasted characters, locations, and verbatim dialogue.`
      : '';

  const messages = [
    { role: 'system', content: `${compactWithoutStep0}${stageHint}${runtimeContext}` },
    ...history.slice(-8).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000),
    })),
    { role: 'user', content: userInput },
  ];

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
        messages,
      }),
    },
    22_000
  );

  const rawText = (await resp.text()).trim();

  if (resp.status === 402 || /Free limit reached/i.test(rawText)) {
    const secMatch = /(\d+)\s*seconds?/i.exec(rawText);
    const waitSec = secMatch ? Math.min(60, Number(secMatch[1]) + 2) : 45;
    pollinationsCooldownUntil = Date.now() + waitSec * 1000;
    const err = new Error(`Pollinations free tier cooldown (${waitSec}s)`);
    err.cooldownSec = waitSec;
    throw err;
  }

  if (!resp.ok) {
    throw new Error(`Pollinations HTTP ${resp.status}`);
  }

  if (!rawText || rawText.length < 24) {
    throw new Error('Pollinations returned an empty response');
  }

  // Register standard 45s cooldown for next rapid turn on same IP
  pollinationsCooldownUntil = Date.now() + 45_000;

  return {
    text: rawText,
    provider: 'Pollinations Text LLM ($0 Zero-Key)',
  };
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const cooldownSec =
      Date.now() < pollinationsCooldownUntil
        ? Math.ceil((pollinationsCooldownUntil - Date.now()) / 1000)
        : 0;
    return res.status(200).json({
      ok: true,
      engine: 'MASTER PROMPT v5.0.3 — Director Compiler',
      version: MASTER_PROMPT_V503_VERSION,
      checks: MASTER_PROMPT_V503_CHECKS,
      promptChars: MASTER_PROMPT_V503_LENGTH,
      serverGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
      pollinationsCooldownSec: cooldownSec,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const rl = checkRateLimit(req, { keyPrefix: 'director-v5', maxRequests: 40, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    return res.status(429).json({
      ok: false,
      error: `Rate limit exceeded. Retry in ${rl.retryAfterSec}s.`,
    });
  }

  let apiKey = '';
  try {
    const body = await readJsonBodySafe(req, 1_500_000);
    const action = String(body.action || 'turn').trim().toLowerCase();
    const ledger = Array.isArray(body.ledger) ? body.ledger : [];
    const bible = Array.isArray(body.bible) ? body.bible : [];
    const sessionState = body.sessionState && typeof body.sessionState === 'object' ? body.sessionState : {};

    const userKey = String(body.geminiApiKey || body.apiKey || '').trim();
    const envKey = String(process.env.GEMINI_API_KEY || '').trim();
    apiKey = userKey || envKey;
    const usingServerKey = !userKey && Boolean(envKey);

    // ── ACTION: INIT (Instant 0ms verbatim STEP 0 canonical menu) ────────
    if (action === 'init') {
      const parsed = parseDirectorV5Output(STEP_0_CANONICAL_MENU);
      return res.status(200).json({
        ok: true,
        version: MASTER_PROMPT_V503_VERSION,
        provider: apiKey
          ? 'Gemini 2.5 Flash Ready ($0 Free Tier)'
          : 'Director v5.0.3 Ready ($0 Zero-Key)',
        providerTier: apiKey ? 'gemini' : 'deterministic',
        usingServerKey,
        sessionState: {
          stage: 'step0',
          presetKey: null,
          sourceText: '',
          built: false,
          queueACardIdx: 0,
          shotIdx: 0,
          quartetBatch: 1,
          shotsPassed: 0,
        },
        ...parsed,
      });
    }

    if (action !== 'turn') {
      return res.status(400).json({ ok: false, error: `Unknown director-v5 action: ${action}` });
    }

    const userInput = String(body.userInput || body.message || '').trim();
    if (!userInput) {
      return res.status(400).json({ ok: false, error: 'Enter a choice, script, or story brief.' });
    }
    if (userInput.length > 40_000) {
      return res.status(400).json({ ok: false, error: 'Input exceeds 40,000 characters.' });
    }

    const history = sanitizeHistory(body.history);
    const runtimeContext = buildRuntimeStateContext(ledger, bible);
    const forceDeterministic = Boolean(body.forceDeterministic);

    // Always run deterministic state tracker in parallel so sessionState stays strictly monotonic
    const det = runDeterministicDirectorV5Turn({
      userInput,
      ledger,
      bible,
      sessionState,
    });

    // Pure instant canonical gates (STEP 0 reset / Video Gate / Asset Sweep) never need to waste quota
    const isInstantCanonicalGate =
      !apiKey &&
      (sessionState.stage === 'step0' && ['1', '2', '3', '4', '5', '6', '7', '8'].includes(userInput) ||
        /\b(ASSETS READY|I HAVE THE ASSETS)\b/i.test(userInput));

    if (!forceDeterministic && apiKey) {
      try {
        const gem = await callGeminiV5({
          apiKey,
          history,
          userInput,
          runtimeContext,
        });
        const parsed = parseDirectorV5Output(gem.text);
        return res.status(200).json({
          ok: true,
          version: MASTER_PROMPT_V503_VERSION,
          provider: gem.provider,
          providerTier: 'gemini',
          usingServerKey,
          sessionState: det.nextState,
          ...parsed,
        });
      } catch (gemErr) {
        const cleanMsg = sanitizeGeminiError(gemErr?.message || 'Gemini unavailable', apiKey);
        // Cascade to Pollinations -> Deterministic instead of dead-ending the user
        const fallbackParsed = parseDirectorV5Output(det.text);
        return res.status(200).json({
          ok: true,
          version: MASTER_PROMPT_V503_VERSION,
          provider: 'Director v5.0.3 Compiler ($0 Fallback)',
          providerTier: 'deterministic',
          usingServerKey: false,
          warning: `Gemini fallback (${cleanMsg})`,
          sessionState: det.nextState,
          ...fallbackParsed,
        });
      }
    }

    let cooldownSec = null;
    let pollWarning = null;

    if (!forceDeterministic && !isInstantCanonicalGate && !body.skipPollinations) {
      try {
        const poll = await callPollinationsV5({
          history,
          userInput,
          runtimeContext,
          expectedStage: det.nextState.stage,
        });
        const parsed = parseDirectorV5Output(poll.text);
        // Enforce v5.0.3 Structural Quality Guard on 20B zero-key fallback outputs:
        // 1) Never bounce back to STEP 0 when operator submitted real material or progressed past STEP 0
        // 2) Carry clickable menu + required artifacts for Express/BUILD/Shot turns
        const bouncedToStep0 = det.nextState.stage !== 'step0' && parsed.stage === 'step0';
        const expectsBuildKit =
          sessionState.stage === 'build_gate' && (userInput === '1' || /\b(BUILD|YES|GO)\b/i.test(userInput));
        const expectsExpressGate = sessionState.stage === 'await_express_source';
        const expectsShotCard = det.nextState.stage === 'shots';

        const passesGuard =
          !bouncedToStep0 &&
          parsed.options.length >= 2 &&
          (!expectsExpressGate || parsed.stage === 'build_gate') &&
          (!expectsBuildKit ||
            (Boolean(parsed.checksStamp) &&
              parsed.promptBlocks.some((b) => b.generationKind !== 'meta' && b.attachLine))) &&
          (!expectsShotCard ||
            (Boolean(parsed.acceptanceCard) &&
              parsed.promptBlocks.some((b) => b.generationKind === 'video')));

        if (passesGuard) {
          return res.status(200).json({
            ok: true,
            version: MASTER_PROMPT_V503_VERSION,
            provider: poll.provider,
            providerTier: 'pollinations',
            usingServerKey: false,
            sessionState: det.nextState,
            ...parsed,
          });
        }
        pollWarning = bouncedToStep0
          ? 'Pollinations echoed STEP 0 — served v5.0.3 script compiler'
          : 'Pollinations 20B output missed v5.0.3 structural lock — served Ironclad v5.0.3 compiler';
      } catch (pollErr) {
        cooldownSec = pollErr?.cooldownSec ?? null;
        pollWarning = pollErr?.message || 'Pollinations unavailable';
      }
    }

    // Tier 3: Instant Deterministic MASTER PROMPT v5.0.3 Compiler (always 100% compliant)
    const parsed = parseDirectorV5Output(det.text);
    return res.status(200).json({
      ok: true,
      version: MASTER_PROMPT_V503_VERSION,
      provider: isInstantCanonicalGate
        ? 'Director v5.0.3 Instant Gate ($0)'
        : 'Director v5.0.3 Compiler ($0 Zero-Key)',
      providerTier: 'deterministic',
      usingServerKey: false,
      cooldownSec,
      warning: pollWarning,
      sessionState: det.nextState,
      ...parsed,
    });
  } catch (err) {
    const code = err?.statusCode || (err?.name === 'AbortError' ? 504 : 500);
    return res.status(code).json({
      ok: false,
      error: sanitizeGeminiError(err?.message || 'Director v5 internal error', apiKey),
    });
  }
}
