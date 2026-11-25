/**
 * Deterministic response parser for MASTER PROMPT v5.0.3 outputs.
 * Extracts:
 * - Current step badge & pipeline stage
 * - Clickable numbered menu choices (1..N, ★ Recommended, EXPRESS/PRESET, Custom)
 * - Isolated fenced copy-paste prompt blocks (Queue A sheets/blueprints/props,
 *   Frame Quartets, Pass 1 Stills, Queue B Video Prompts, Motion, Last Frame,
 *   Execution Commands) along with ATTACH: lines & target filenames
 * - 12-Point Acceptance Card structured cells
 * - CHECKS: 78/78 PASS verification stamp
 * - Asset Inventory Ledger updates (REF BOUND / APPROVED / PENDING)
 */

const STEP_BADGE_RE = /\[(STEP\s+[^\]]+|PHASE\s+\d+[^\]]*|ONBOARDING CHECKPOINT[^\]]*)\]/i;
const MENU_OPTION_RE = /^\s*(\d{1,2})[.)]\s+(.+)$/;
const FENCE_RE = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
const ATTACH_LINE_RE = /^(?:ATTACH|attach)\s*:\s*(.+)$/im;
const FILENAME_RE =
  /\b((?:[a-z0-9][a-z0-9_-]*_w\d+_(?:sheet|faceF|bodyF)|set_[a-z0-9_-]+_(?:sheet|angles|main)|blueprint_[a-z0-9_-]+|prop_[a-z0-9_-]+(?:_sheet)?|S\d+[A-Za-z]?_(?:f(?:-[A-D])?|lastf)|s\d+[a-z]?)\.(?:jpg|jpeg|png|webp|mp4))\b/gi;
const CHECKS_RE = /CHECKS:\s*(\d+\/\d+\s+PASS)/i;

function normalizeFilename(raw) {
  return String(raw || '')
    .trim()
    .replace(/^['"`(]+|['"`),.;:]+$/g, '');
}

function detectAspectRatio(text) {
  const m = /\b(16:9|9:16|1:1|21:9)\b/.exec(text);
  return m ? m[1] : '16:9';
}

function detectDurationSec(text) {
  const m =
    /\b(?:DURATION\s*=\s*|gen\s+|Duration Tier:\s*)(\d{1,2})s\b/i.exec(text) ||
    /^(\d{1,2})\s+seconds\b/i.exec(text.trim());
  if (!m) return 5;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.max(2, Math.min(15, n)) : 5;
}

function detectShotId(text, contextHeading) {
  const hay = `${contextHeading || ''}\n${text || ''}`;
  const m =
    /\b(?:===|PASS 1 STILL FRAME|VIDEO GENERATION|ACCEPTANCE CARD:|GENERATE|SHOT)\s+(S\d+[A-Za-z]?)\b/i.exec(
      hay
    ) || /\b(S\d+[A-Za-z]?)_(?:f(?:-[A-D])?|lastf)\.jpg\b/i.exec(hay);
  return m ? m[1].toUpperCase() : undefined;
}

function inferRoleFromFilename(filename) {
  const f = filename.toLowerCase();
  if (f.includes('_w') && (f.includes('_sheet') || f.includes('_facef') || f.includes('_bodyf'))) {
    return 'face lock';
  }
  if (f.startsWith('blueprint_')) return 'blueprint';
  if (f.startsWith('set_') && f.includes('_angles')) return 'spatial angles';
  if (f.startsWith('set_')) return 'spatial lock';
  if (f.startsWith('prop_')) return 'prop lock';
  if (/_f(?:-[a-d])?\.(?:jpg|png|webp)$/i.test(f)) return 'start frame';
  if (/_lastf\.(?:jpg|png|webp)$/i.test(f)) return 'last frame';
  if (/^s\d+[a-z]?\.mp4$/i.test(f)) return 'finished clip';
  return 'reference';
}

function inferTokenFromFilename(filename) {
  const f = filename.trim();
  let m = /^([a-z0-9_-]+)_w(\d+)_(?:sheet|facef|bodyf)\./i.exec(f);
  if (m) return `@${m[1].toUpperCase()}_W${m[2]}`;
  m = /^set_([a-z0-9_-]+)_(?:sheet|angles|main)\./i.exec(f);
  if (m) return `@SET-${m[1].toUpperCase()}`;
  m = /^blueprint_([a-z0-9_-]+)\./i.exec(f);
  if (m) return `@SET-${m[1].toUpperCase()}`;
  m = /^prop_([a-z0-9_-]+?)(?:_sheet)?\./i.exec(f);
  if (m) return `@PROP-${m[1].toUpperCase()}`;
  m = /^(S\d+[A-Za-z]?)(?:_f(?:-[A-D])?|_lastf)?\.(?:jpg|png|webp|mp4)$/i.exec(f);
  if (m) return m[1].toUpperCase();
  return `@${f.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '_')}`;
}

export function extractStepBadge(text) {
  const matches = [...String(text || '').matchAll(/\[((?:STEP|PHASE)[^\]]{2,96})\]/gi)];
  if (matches.length > 0) {
    return `[${matches[matches.length - 1][1].trim()}]`;
  }
  const single = STEP_BADGE_RE.exec(String(text || ''));
  return single ? `[${single[1].trim()}]` : null;
}

export function inferPipelineStage(text, stepBadge) {
  const badge = String(stepBadge || '').toUpperCase();
  const hay = `${badge}\n${String(text || '').slice(0, 2600)}`.toUpperCase();

  // Prioritize the explicit active [STEP ...] / [PHASE ...] badge first
  if (badge.includes('STEP 0 — ENTRY') || badge.includes('STEP 0 - ENTRY')) return 'step0';
  if (badge.includes('ASSET INVENTORY SWEEP') || badge.includes('STEP 2.0')) return 'sweep';
  if (badge.includes('STEP O-V')) return 'video_gate';
  if (badge.includes('STEP A-')) return 'auto_story';
  if (badge.includes('O-16') || badge.includes('FINAL GATE: BUILD')) return 'build_gate';
  if (badge.includes('PHASE 5')) return 'assembly';
  if (badge.includes('SHOT S') || badge.includes('ACCEPTANCE CARD') || badge.includes('STEP B — VIDEO')) return 'shots';
  if (badge.includes('ASSET GATE')) return 'asset_gate';
  if (badge.includes('QUEUE A') || badge.includes('STEP 0 ASSETS')) return 'queue_a';
  if (/STEP\s+\d+[A-Z]?\s+OF\s+16|\bO-\d+/i.test(badge)) return 'onboarding';

  // Fallback to body inspection when model omits bracketed badge
  if (hay.includes('STEP 0 — ENTRY') || hay.includes('STEP 0 - ENTRY')) return 'step0';
  if (hay.includes('ASSET INVENTORY SWEEP')) return 'sweep';
  if (hay.includes('STEP O-V')) return 'video_gate';
  if (hay.includes('STEP A-')) return 'auto_story';
  if (hay.includes('PHASE 5')) return 'assembly';
  if (hay.includes('ACCEPTANCE CARD:') || hay.includes('STEP B — VIDEO GENERATION') || hay.includes('STEP A — PASS 1 STILL FRAME')) {
    return 'shots';
  }
  if (hay.includes('O-16') || hay.includes('FINAL GATE: BUILD')) return 'build_gate';
  if (hay.includes('ASSET GATE')) return 'asset_gate';
  if (hay.includes('STEP 0 ASSETS') || hay.includes('QUEUE A CARD')) return 'queue_a';
  if (hay.includes('CHECKS: 78/78 PASS') || hay.includes('12-ITEM PRODUCTION KIT') || hay.includes('DISPENSE LEDGER')) {
    return 'build';
  }
  if (/STEP\s+\d+[a-z]?\s+OF\s+16|\bO-\d+/i.test(hay)) return 'onboarding';
  return 'active';
}

/**
 * Extracts the active clickable numbered menu (1..N) from the tail of the assistant message.
 * Handles menus both inside a trailing fenced ```text block and as plain numbered lines.
 */
export function extractMenuOptions(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');

  // Walk backwards to locate the LAST contiguous numbered menu block (1..N)
  const blocks = [];
  let current = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    const m = MENU_OPTION_RE.exec(line);
    if (m) {
      const num = Number(m[1]);
      const label = m[2].trim();
      // Skip acceptance card inline cells or prose numbers that aren't sequential choices
      if (num === 1 && current.length > 0) {
        blocks.push(current);
        current = [];
      }
      if (
        (current.length === 0 && num === 1) ||
        (current.length > 0 && num === current[current.length - 1].number + 1)
      ) {
        current.push({ number: num, label });
      } else if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else if (current.length > 0) {
      // Allow a brief wrapped continuation line only if short and not a header
      if (!/^[#=\[]/.test(line.trim()) && line.trim().length < 110 && current.length < 16) {
        // Check if next line continues numbering
        const nextLine = lines[i + 1] || '';
        const nextM = MENU_OPTION_RE.exec(nextLine);
        if (nextM && Number(nextM[1]) === current[current.length - 1].number + 1) {
          current[current.length - 1].label += ' ' + line.trim();
          continue;
        }
      }
      blocks.push(current);
      current = [];
    }
  }
  if (current.length > 0) blocks.push(current);

  // Pick the last block with >= 2 sequential choices starting at 1
  const validBlocks = blocks.filter((b) => b.length >= 2 && b[0].number === 1);
  if (validBlocks.length === 0) return [];
  const chosen = validBlocks[validBlocks.length - 1];

  return chosen.map((item) => {
    const label = item.label.replace(/\s+/g, ' ').trim();
    const recommended = label.includes('★') || /\brecommended\b/i.test(label);
    const isExpress = /\b(EXPRESS:|PRESET:|FAST-TRACK|RECOMMENDED ALL)\b/i.test(label);
    const isCustom = /^Custom\b/i.test(label);
    return {
      number: item.number,
      label,
      recommended,
      isExpress,
      isCustom,
      value: String(item.number),
    };
  });
}

function classifyPromptBlock(content, surroundingHeading) {
  const body = content.trim();
  const bodyNoAttach = body.replace(/^ATTACH\s*:[^\n]*\n?/im, '').trim();
  const upper = body.toUpperCase();
  const headingLines = String(surroundingHeading || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const nearestHeading = (headingLines[headingLines.length - 1] || '').toUpperCase();
  const headingUpper = headingLines.join('\n').toUpperCase();

  // Exclude non-prompt fenced blocks (menus, ledgers, acceptance cards, panel headers, registers)
  if (
    /^\[STEP\s+/i.test(body) ||
    /^ASSET INVENTORY SWEEP/i.test(body) ||
    /^DISPENSE LEDGER/i.test(body) ||
    /^KIT FULLY SERVED/i.test(body) ||
    /^===\s*S\d+/i.test(body) ||
    (/^\s*1\)\s+/m.test(body) && /^\s*2\)\s+/m.test(body) && body.split('\n').length <= 18)
  ) {
    return null;
  }

  if (/^Acceptance Card:/i.test(body)) {
    return { category: 'acceptance_card', generationKind: 'meta', title: '12-Point Acceptance Card' };
  }

  if (/^Duration Tier:/i.test(body) && upper.includes('EXECUTION COMMAND:')) {
    return { category: 'execution', generationKind: 'meta', title: 'Shot Metadata & Execution Command' };
  }

  // 1) Queue A specialized sheets & blueprints (highest specificity)
  if (upper.includes('BLUEPRINT — NOT A FRAME') || upper.includes('2D ARCHITECTURAL BLUEPRINT')) {
    return {
      category: 'queue_a_blueprint',
      generationKind: 'image',
      title: 'Queue A — Top-Down Set Blueprint',
    };
  }

  if (
    upper.includes('EXACTLY 8 PANELS') &&
    (upper.includes('SAME PROP') || headingUpper.includes('PROP'))
  ) {
    return {
      category: 'queue_a_prop',
      generationKind: 'image',
      title: 'Queue A — Hero Prop Chroma-Green 8-Grid',
    };
  }

  if (
    upper.includes('EXACTLY 8 PANELS') &&
    (upper.includes('SAME SET') || headingUpper.includes('ANGLE-GRID') || headingUpper.includes('ANGLE GRID') || headingUpper.includes('ANGLES'))
  ) {
    return {
      category: 'queue_a_angles',
      generationKind: 'image',
      title: 'Queue A — Set 8-View Angle Grid',
    };
  }

  if (
    upper.includes('EXACTLY 8 PANELS') ||
    (headingUpper.includes('CHARACTER') && headingUpper.includes('GRID')) ||
    upper.includes('2-COLUMN X 4-ROW GRID')
  ) {
    return {
      category: 'queue_a_char',
      generationKind: 'image',
      title: 'Queue A — Character 2x4 Chroma-Green Sheet',
    };
  }

  if (
    upper.includes('EXACTLY 4 PANELS') ||
    upper.includes('2-COLUMN X 2-ROW GRID') ||
    headingUpper.includes('SET GRID')
  ) {
    return {
      category: 'queue_a_set',
      generationKind: 'image',
      title: 'Queue A — Location 2x2 Set Grid Sheet',
    };
  }

  // 2) Specific shot sub-blocks (checked by nearest heading BEFORE broader context)
  if (nearestHeading.includes('QUEUE B') || nearestHeading.includes('VIDEO PROMPT')) {
    return {
      category: 'queue_b_video',
      generationKind: 'video',
      title: 'Queue B — Video Prompt',
    };
  }

  if (nearestHeading.includes('MOTION PROMPT') || /^\d{1,2}\s+seconds,\s+/i.test(bodyNoAttach)) {
    return {
      category: 'motion',
      generationKind: 'video',
      title: 'Image-to-Video Motion Prompt',
    };
  }

  if (nearestHeading.includes('LAST FRAME') || /\bS\d+[A-Z]?_lastf\.jpg\b/i.test(nearestHeading)) {
    return {
      category: 'last_frame',
      generationKind: 'image',
      title: 'Pass 2 — Last Frame Continuity Target',
    };
  }

  if (
    nearestHeading.includes('QUARTET') ||
    /\bS\d+[A-Z]?_f-[A-D]\b/i.test(`${nearestHeading} ${body}`)
  ) {
    return {
      category: 'quartet',
      generationKind: 'image',
      title: 'Frame Quartet — Start Frame Candidate',
    };
  }

  if (
    nearestHeading.includes('PASS 1 STILL') ||
    /^Render with\s+/i.test(bodyNoAttach)
  ) {
    return {
      category: 'still_frame',
      generationKind: 'image',
      title: 'Pass 1 — Start Frame Still Prompt',
    };
  }

  if (
    (upper.includes('WARDROBE COLOR LOCK') && upper.includes('AVOID:')) ||
    (upper.includes('ROOM TONE:') && upper.includes('AVOID:'))
  ) {
    return {
      category: 'queue_b_video',
      generationKind: 'video',
      title: 'Queue B — Video Prompt',
    };
  }

  // Only treat generic fenced blocks as prompts if they look like visual generation prompts
  if (
    body.length >= 60 &&
    !body.startsWith('@') &&
    !upper.includes('LOCATION LOCK:') &&
    !upper.includes('AXIS MAP @') &&
    !upper.includes('PATCH SCOPE:') &&
    (/\b(?:35mm|50mm|85mm|film grain|cinematic|camera|shot|lighting|render with|avoid:)\b/i.test(body) ||
      ATTACH_LINE_RE.test(body))
  ) {
    const isVid = /\b(?:dolly|pan|seconds|camera move|motion speed|room tone|says in)\b/i.test(body);
    return {
      category: isVid ? 'queue_b_video' : 'prompt',
      generationKind: isVid ? 'video' : 'image',
      title: isVid ? 'Video Generation Prompt' : 'Image Generation Prompt',
    };
  }

  return null;
}

export function extractPromptBlocks(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const blocks = [];
  let match;
  let idx = 0;

  while ((match = FENCE_RE.exec(raw)) !== null) {
    const body = match[2].trim();
    if (!body) continue;

    // Look at up to 240 chars immediately preceding the fence for heading / filename context
    const before = raw.slice(Math.max(0, match.index - 260), match.index).trim();
    const headingLines = before.split('\n').slice(-4).join('\n');

    const classified = classifyPromptBlock(body, headingLines);
    if (!classified) continue;

    const attachMatch = ATTACH_LINE_RE.exec(body);
    const attachLine = attachMatch ? attachMatch[0].trim() : '';
    const attachFromHeader = /\battach:\s*([^\n=]+)/i.exec(headingLines);
    const attachSearchSpace = `${attachLine}\n${attachFromHeader ? attachFromHeader[1] : ''}`;
    const attachFiles = Array.from(
      new Set(
        [...attachSearchSpace.matchAll(FILENAME_RE)].map((m) => normalizeFilename(m[1]))
      )
    );

    // Target output filename (e.g. "save as S1_f.jpg" or "mara_w1_sheet.jpg" in heading)
    let assetFilename;
    const saveAsMatch = /save\s+as\s+([a-zA-Z0-9._-]+\.(?:jpg|jpeg|png|webp|mp4))/i.exec(headingLines);
    if (saveAsMatch) {
      assetFilename = normalizeFilename(saveAsMatch[1]);
    } else {
      const headingFiles = [...headingLines.matchAll(FILENAME_RE)].map((m) => normalizeFilename(m[1]));
      if (headingFiles.length > 0) {
        // For video/motion blocks, prefer .mp4; for still/sheet blocks prefer .jpg/.png
        assetFilename =
          headingFiles.find((f) =>
            classified.generationKind === 'video' ? f.endsWith('.mp4') : !f.endsWith('.mp4')
          ) || headingFiles[0];
      }
    }

    const shotId = detectShotId(body, headingLines);
    const aspectRatio = detectAspectRatio(`${headingLines}\n${body}`);
    const durationSec = detectDurationSec(`${headingLines}\n${body}`);

    // Clean prompt text (strip leading ATTACH: line so image/video generators receive pure prompt prose)
    const promptText = body
      .replace(/^ATTACH\s*:[^\n]*\n?/im, '')
      .trim();

    let title = classified.title;
    if (assetFilename && !title.includes(assetFilename)) {
      title = `${title} (${assetFilename})`;
    } else if (shotId && !title.includes(shotId)) {
      title = `${title} — ${shotId}`;
    }

    idx += 1;
    blocks.push({
      id: `blk_${idx}_${classified.category}`,
      title,
      category: classified.category,
      generationKind: classified.generationKind,
      assetFilename,
      shotId,
      aspectRatio,
      durationSec,
      attachFiles,
      attachLine,
      rawBlock: body,
      promptText,
      copyText: body,
      isQuartet: classified.category === 'quartet',
    });
  }

  return blocks;
}

export function extractAcceptanceCard(text) {
  const m = /Acceptance Card:\s*(S\d+[A-Za-z]?)\s*\|([^\n`]+)/i.exec(String(text || ''));
  if (!m) return null;
  const shotId = m[1].toUpperCase();
  const parts = m[2]
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);

  const cells = parts.map((part, i) => {
    const cm = /^(\d{1,2})\.\s*([^=:]+?)\s*[=:]\s*(.+)$/.exec(part);
    if (cm) {
      return {
        index: Number(cm[1]),
        name: cm[2].trim(),
        detail: cm[3].trim(),
      };
    }
    return {
      index: i + 1,
      name: `CHECK ${i + 1}`,
      detail: part,
    };
  });

  return { shotId, cells };
}

export function extractLedgerUpdates(text, promptBlocks = []) {
  const map = new Map();
  const raw = String(text || '');

  // 1) Explicit ledger lines: `<filename> ↔ <@token> ↔ <role>` or status mentions
  for (const line of raw.split('\n')) {
    // Skip Dispense Ledger header/summary lines that mention all status labels simultaneously
    if (
      /^\s*(?:A\s*\(Asset Cards\)|B\+F\s*\(|ASSET GATE:|DISPENSE LEDGER|KIT FULLY SERVED)/i.test(line) ||
      /REF BOUND\/APPROVED/i.test(line) ||
      /^\s*\d+[.)]\s+/.test(line)
    ) {
      continue;
    }
    const files = [...line.matchAll(FILENAME_RE)].map((m) => normalizeFilename(m[1]));
    if (files.length === 0) continue;

    let status = null;
    if (/REF BOUND/i.test(line)) {
      status = 'REF BOUND';
    } else if (/QUEUE A REQUIRED|PENDING|card required|never\s+(?:pre-)?approved/i.test(line)) {
      status = 'PENDING';
    } else if (
      /(?<![-\w])APPROVED\b(?:\s+IN\s+O-6|\s*\(verified_on_disk\))?/i.test(line) &&
      !/Confirm\s+/i.test(line)
    ) {
      status = 'APPROVED';
    }

    const tokenMatch = /(@[A-Z0-9_-]+)/.exec(line);
    for (const file of files) {
      // Skip video output files or example files unless explicitly marked with status or arrow
      if (!status && !line.includes('↔') && !line.includes('save as')) continue;
      const key = file.toLowerCase();
      const prev = map.get(key);
      const nextStatus = status || prev?.status || 'PENDING';
      // Priority: REF BOUND > APPROVED > PENDING
      const rank = { PENDING: 1, APPROVED: 2, 'REF BOUND': 3 };
      const bestStatus =
        prev && rank[prev.status] > rank[nextStatus] ? prev.status : nextStatus;

      map.set(key, {
        filename: file,
        token: tokenMatch ? tokenMatch[1] : prev?.token || inferTokenFromFilename(file),
        role: prev?.role || inferRoleFromFilename(file),
        status: bestStatus,
      });
    }
  }

  // 2) Add any target assetFilename discovered in Queue A / Still / Quartet prompt blocks as PENDING if unseen
  for (const blk of promptBlocks) {
    if (!blk.assetFilename) continue;
    const key = blk.assetFilename.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        filename: blk.assetFilename,
        token: inferTokenFromFilename(blk.assetFilename),
        role: inferRoleFromFilename(blk.assetFilename),
        status: 'PENDING',
        shotId: blk.shotId,
      });
    }
  }

  return Array.from(map.values());
}

export function parseDirectorV5Output(text) {
  const cleanText = String(text || '').trim();
  const stepBadge = extractStepBadge(cleanText);
  const stage = inferPipelineStage(cleanText, stepBadge);
  const options = extractMenuOptions(cleanText);
  const promptBlocks = extractPromptBlocks(cleanText);
  const acceptanceCard = extractAcceptanceCard(cleanText);
  const checksMatch = CHECKS_RE.exec(cleanText);
  const checksStamp = checksMatch ? checksMatch[1].toUpperCase() : null;
  const ledgerUpdates = extractLedgerUpdates(cleanText, promptBlocks);

  return {
    text: cleanText,
    stepBadge,
    stage,
    options,
    promptBlocks,
    acceptanceCard,
    checksStamp,
    ledgerUpdates,
  };
}
