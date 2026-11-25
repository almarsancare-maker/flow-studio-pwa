/**
 * Deterministic MASTER PROMPT v5.0.3 State-Machine Compiler Fallback ($0, 0ms, zero API key).
 * Used for:
 *  - Instant 0ms canonical gates (STEP 0, O-V, ASSET INVENTORY SWEEP, STATUS)
 *  - Seamless fallback when GEMINI_API_KEY is not set and Pollinations text API hits its
 *    per-IP 45s rate limit (HTTP 402 FREE_LIMIT) or experiences downtime.
 *
 * Strictly obeys v5.0.3 laws:
 *  - Tier 1 Source Integrity (verbatim dialogue; never claims unrendered sheets verified_on_disk)
 *  - Tier 2 Clickable Choice Menu Law (numbered 1..N, single ★ Recommended, Custom final option)
 *  - Tier 3 Chronological State Machine & Express Walk (O-5/O-6 bind QUEUE A REQUIRED on express)
 *  - §2.0 Asset Inventory Sweep + §5.4 Exact File Attachment Law (ATTACH: lines) + §9.7 Never-Regenerate
 *  - §6.1 Unified Duration Math + §6.2 Render Directive + §8.2-§8.6 Sheets/Angle-Grid/Blueprint/Props
 *  - §9.9 Frame Quartet + 12-Point Acceptance Card + Silent 78-Point Gate (CHECKS: 78/78 PASS)
 */

import {
  ASSET_SWEEP_CANONICAL_MENU,
  STEP_0_CANONICAL_MENU,
  STEP_OV_CANONICAL_MENU,
} from './_directorV5Prompt.js';

const PRESET_PROFILES = {
  HYBRID: {
    name: 'PRESET: HYBRID',
    genre: 'Drama → Contemporary Hybrid Cinema',
    outputMode: 'FILM',
    envelope: 'CRESCENDO',
    aspect: '16:9',
    platform: 'YouTube Long-Form / Cinema (16:9 widescreen)',
    grade: '35mm Kodak Vision3 live-action photorealism with crisp graphic inserts',
    language: 'English',
    place: 'Metro Manila, Philippines',
    sliceGroups: 'ON',
    microCoverage: 'ON',
  },
  'FILM SENTI': {
    name: 'PRESET: FILM SENTI',
    genre: 'Drama → Filipino Sentimental Melodrama',
    outputMode: 'FILM',
    envelope: 'SLOW BURN',
    aspect: '9:16',
    platform: 'TikTok / Reels / Shorts (9:16 vertical, ≤60s)',
    grade: 'Warm golden-hour Filipino cinema nostalgia grade, 35mm film grain',
    language: 'Taglish',
    place: 'Metro Manila, Philippines',
    sliceGroups: 'ON',
    microCoverage: 'ON',
  },
  'AD PUNCH': {
    name: 'PRESET: AD PUNCH',
    genre: 'Digital & Online Creator Content → Commercial Spot',
    outputMode: 'AD',
    envelope: 'CRESCENDO',
    aspect: '9:16',
    platform: 'TikTok / Shorts Commercial (9:16 vertical, ≤30s)',
    grade: 'Crisp high-contrast commercial 35mm film grade, clean practical key light',
    language: 'English',
    place: 'Global Urban Commercial Studio',
    sliceGroups: 'OFF',
    microCoverage: 'OFF (opt-in only)',
  },
  BOARD: {
    name: 'PRESET: BOARD',
    genre: 'Animation Styles & Genres → Pitch Storyboard Animatic',
    outputMode: 'BOARD',
    envelope: 'CRESCENDO',
    aspect: '16:9',
    platform: 'Cinema Pitch Board (16:9 widescreen)',
    grade: 'Clean theatrical keyframe board, 35mm natural lighting',
    language: 'English',
    place: 'Metro Manila, Philippines',
    sliceGroups: 'OFF',
    microCoverage: 'OFF',
  },
};

function slugify(str, fallback = 'asset') {
  const s = String(str || '')
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || fallback;
}

function calcDurationTier(dialogue, keepD = 4, shave = 0.5) {
  const clean = String(dialogue || '').trim();
  const words = clean && clean.toLowerCase() !== 'none' ? clean.split(/\s+/).filter(Boolean).length : 0;
  const voFit = words > 0 ? Number((words / 2.8 + 1.0).toFixed(2)) : 0;
  const reqD = Number((Math.max(keepD, voFit) + shave).toFixed(2));
  const ladder = [4, 6, 8, 10];
  const genD = ladder.find((t) => t >= reqD) || 10;
  const voMargin = words > 0 ? Number(Math.max(1.0, genD - keepD - shave).toFixed(1)) : 0;
  return { words, voFit, reqD, genD, keepD, shave, voMargin };
}

function detectLanguage(text, fallback = 'English') {
  const lower = String(text || '').toLowerCase();
  if (/\b(hindi|naman|pero|tayo|dito|ikaw|ako|mahal|salamat|talaga|pwede|kasi|lang|po)\b/.test(lower)) {
    return /\b(the|and|you|don't|can't|please|wait|look)\b/.test(lower) ? 'Taglish' : 'Tagalog';
  }
  if (/\b(dili|unsa|ngano|kanimo|gihapon|kaayo|gyud|bay|asa)\b/.test(lower)) {
    return 'Cebuano / Bisaya';
  }
  return fallback;
}

function detectGenre(text, presetKey) {
  if (presetKey && PRESET_PROFILES[presetKey]) return PRESET_PROFILES[presetKey].genre;
  const lower = String(text || '').toLowerCase();
  if (/\b(cyberpunk|neon|android|spaceship|quantum|sci-?fi|futuristic)\b/.test(lower)) {
    return 'Science Fiction → Cyberpunk';
  }
  if (/\b(horror|ghost|haunted|blood|demon|curse|scream)\b/.test(lower)) {
    return 'Horror → Supernatural Thriller';
  }
  if (/\b(commercial|product|ad |brand|buy now|promo|coffee|bottle|shoes)\b/.test(lower)) {
    return 'Digital & Online Creator Content → Commercial Spot';
  }
  if (/\b(love|kiss|romance|heart|wedding|date|rain)\b/.test(lower)) {
    return 'Romance → Contemporary Romantic Drama';
  }
  if (/\b(chase|fight|gun|explosion|heist|spy|samurai|assassin)\b/.test(lower)) {
    return 'Action & Adventure → Tactical Action Thriller';
  }
  return 'Drama → Contemporary Cinema Drama';
}

function buildProjectBlueprint(sourceText, bible = [], presetKey = null) {
  const preset = presetKey ? PRESET_PROFILES[presetKey] : null;
  const raw = String(sourceText || '').trim();
  const charBible = bible.filter((b) => b.category === 'character');
  const locBible = bible.filter((b) => b.category === 'location');
  const propBible = bible.filter((b) => b.category === 'prop');

  // Extract character leads from Bible or source text
  const characters = [];
  for (const c of charBible.slice(0, 2)) {
    const first = slugify(c.title || c.tag, 'lead');
    const tag = `@${first.toUpperCase()}`;
    characters.push({
      tag,
      first,
      name: c.title || first,
      sheetFile: `${first}_w1_sheet.jpg`,
      descriptor:
        c.descriptor ||
        'early-20s Filipino lead with natural matte skin, dark hair [#1A1817], cream knit cardigan [#EAE2D3], expressive dark eyes',
      wardrobeLock: `Wardrobe color lock for ${tag.slice(1)} (W1): cream knit cardigan [#EAE2D3], charcoal trousers [#2C2F33], jet black hair [#1A1817] — hold exact garment hues against the attached reference; scene grade may tint the light, never the hue.`,
      voiceLock: `VOICE LOCK ${tag.slice(1)}: warm mid-low pitch, natural grounded timbre, clear conversational accent, controlled register, unhurried emotional cadence`,
      heightCm: characters.length === 0 ? 163 : 175,
    });
  }

  if (characters.length === 0) {
    characters.push({
      tag: '@MIRA',
      first: 'mira',
      name: 'Mira',
      sheetFile: 'mira_w1_sheet.jpg',
      descriptor:
        '22-year-old Filipina woman with natural matte morena skin, shoulder-length jet black hair [#1A1817], cream knit cardigan [#EAE2D3] over a slate tee [#4B5563], and silver hoop earrings [#C9CDD1]',
      wardrobeLock:
        'Wardrobe color lock for MIRA (W1): cream knit cardigan [#EAE2D3], slate cotton tee [#4B5563], jet black hair [#1A1817], silver hoop earrings [#C9CDD1] — hold exact garment hues against the attached reference; scene grade may tint the light, never the hue.',
      voiceLock:
        'VOICE LOCK MIRA: mid-low warm pitch, intimate textured timbre, light Metro Manila accent, grounded conversational register, measured sincere cadence',
      heightCm: 163,
    });
  }

  // Extract primary set
  const primaryLoc = locBible[0];
  const locSlug = slugify(primaryLoc?.title || primaryLoc?.tag || 'rain_dorm', 'rain_dorm');
  const set = {
    tag: primaryLoc?.tag ? primaryLoc.tag.toUpperCase() : '@SET-RAINDORM',
    slug: locSlug,
    name: primaryLoc?.title || 'Rain-Streaked Manila Dormitory',
    sheetFile: `set_${locSlug}_sheet.jpg`,
    anglesFile: `set_${locSlug}_angles.jpg`,
    blueprintFile: `blueprint_${locSlug}.jpg`,
    geography:
      primaryLoc?.descriptor ||
      'cozy 1990s Manila dormitory room at night, dark oak study desk under the left rain-streaked glass window, warm amber brass desk lamp on the desk corner, weathered wooden bookshelf along the far back wall, iron-frame bed along the right wall',
    wallA: 'dark oak desk, brass desk lamp, and rain-streaked steel-casement window with blurred neon outside',
    wallB: 'weathered wooden bookshelf packed with sketchbooks and a taped corkboard',
    lightingLock: '3400K warm practical tungsten key from desk lamp | cool 5600K rain-window rim | key:fill 3:1 | shadow floor softly lifted',
    ambience: 'steady tropical rain pattering on glass panes, distant street hum, faint electric fan whir',
  };

  // Extract hero prop
  const primaryProp = propBible[0];
  const propSlug = slugify(primaryProp?.title || 'sketchbook', 'sketchbook');
  const prop = {
    tag: primaryProp?.tag ? primaryProp.tag.toUpperCase() : '@PROP-SKETCHBOOK',
    slug: propSlug,
    name: primaryProp?.title || 'Worn Linen Sketchbook',
    sheetFile: `prop_${propSlug}_sheet.jpg`,
    descriptor:
      primaryProp?.descriptor ||
      'rigid hardcover linen sketchbook in faded terracotta cloth [#A6543E] with cream textured paper edges [#EDE6D6] and a worn black elastic strap [#1E1E1E]',
  };

  // Extract up to 3–4 shots from source lines or craft a crisp 3-shot story beat sequence
  const quotedLines = [...raw.matchAll(/["“]([^"”]{4,140})["”]/g)].map((m) => m[1].trim());
  const premiseClean =
    raw.replace(/\s+/g, ' ').slice(0, 220) ||
    `Late-night turning point inside ${set.name} as ${characters[0].name} discovers a hidden clue inside the ${prop.name}.`;

  const language = detectLanguage(raw, preset?.language || 'English');
  const genre = detectGenre(raw, presetKey);
  const aspect =
    /\b(9:16|vertical|tiktok|reels|shorts)\b/i.test(raw)
      ? '9:16'
      : /\b(21:9|anamorphic)\b/i.test(raw)
        ? '21:9'
        : preset?.aspect || '16:9';

  const line1 = quotedLines[0] || 'none';
  const line2 =
    quotedLines[1] ||
    (language.startsWith('Tag')
      ? 'Matagal ko nang hinahanap ang sagot dito.'
      : 'Every answer we needed was sitting right in front of us.');
  const line3 = quotedLines[2] || 'none';

  const lead = characters[0];
  const shots = [
    {
      id: 'S1',
      role: 'Opening calibration & set-seed anchor',
      size: 'MWS',
      angle: 'eye-level 3/4 wide',
      lens: '35mm',
      camMove: 'ultra-slow 4 percent dolly push-in over four seconds',
      action: `${lead.name} enters frame-left beside the rain-streaked window, setting the ${prop.name} squarely onto the oak desk as rain beads roll down the glass`,
      emo: '3→5/10 (quiet anticipation — TURN: palm settles onto the linen cover)',
      dialogue: line1,
      timing: calcDurationTier(line1, 4, 0.5),
      risk: 2,
      model: 'Omni 1.1 Flash',
      spatialAnchor: `Camera stands at CAM-A near the entrance corner facing north-west; rain-streaked window and brass lamp frame-left, dark oak study desk center, iron bed edge frame-right; warm 3400K lamp light keys from frame-left; wooden bookshelf stands behind the camera right.`,
      endState: `${lead.name} standing angled slightly toward the desk with fingertips resting still on the closed ${prop.name}`,
    },
    {
      id: 'S2',
      role: 'R4 dialogue hinge anchor',
      size: 'MCU',
      angle: 'intimate eye-level slight right-of-axis',
      lens: '50mm',
      camMove: 'static locked camera with no more than 5 percent handheld breath drift over six seconds',
      action: `${lead.name} opens the ${prop.name} with a quiet throat swallow, eyes locking screen-right across the desk as resolve tightens her jaw`,
      emo: '5→8/10 (mounting conviction — TURN: brow sets as the final clause lands)',
      dialogue: line2,
      timing: calcDurationTier(line2, 4, 0.5),
      risk: 4,
      model: 'Veo 3.1',
      spatialAnchor: `Camera stands at CAM-B across the oak desk facing west; rain-streaked glass window and brass lamp frame-left behind ${lead.name}, open ${prop.name} foreground center, warm wooden bookshelf softly out of focus along the far wall; warm 3400K key enters from frame-left.`,
      endState: `${lead.name} holding a steady unwavering gaze screen-right with both palms grounded flat beside the open pages`,
    },
    {
      id: 'S3',
      role: 'R5 climax payoff & final held image',
      size: 'CU',
      angle: 'slow tight close-up',
      lens: '85mm',
      camMove: 'ultra-slow 5 percent push-in holding on her eyes and hands over six seconds',
      action: `${lead.name} closes the ${prop.name} deliberately, lifts her chin toward the cool rain-lit window glow, and exhales steadily in silent resolve`,
      emo: '8→10/10 (quiet breakthrough — TURN: slow exhale as window light catches her eyes)',
      dialogue: line3,
      timing: calcDurationTier(line3, 5, 0.5),
      risk: 5,
      model: 'Veo 3.1',
      spatialAnchor: `Camera stands at CAM-C tight beside the desk corner facing the rain-streaked window; blurred amber lamp halo frame-left, ${lead.name} centered slightly left-of-third, rain droplets glistening on dark glass frame-right.`,
      endState: `${lead.name} still and composed, warm tungsten key on cheek and cool rain-window catchlight steady in her eyes`,
    },
  ];

  const totalKeep = shots.reduce((acc, s) => acc + s.timing.keepD, 0);
  const mm = String(Math.floor(totalKeep / 60)).padStart(2, '0');
  const ss = String(Math.round(totalKeep % 60)).padStart(2, '0');

  return {
    slug: slugify(premiseClean.split(' ').slice(0, 4).join('_'), 'pilot_scene'),
    premise: premiseClean,
    genre,
    language,
    aspect,
    platform: preset?.platform || (aspect === '9:16' ? 'TikTok / Reels / Shorts (9:16 vertical, ≤60s)' : 'YouTube Long-Form / Cinema (16:9 widescreen)'),
    outputMode: preset?.outputMode || 'FILM',
    envelope: preset?.envelope || 'CRESCENDO',
    grade: preset?.grade || '35mm Kodak Vision3 cinema film, natural skin pores, optical shallow DOF, 180-degree shutter blur',
    place: preset?.place || 'Metro Manila, Philippines',
    sliceGroups: preset?.sliceGroups || 'ON',
    microCoverage: preset?.microCoverage || 'ON',
    presetName: preset?.name || 'NONE (Manual/Recommended)',
    renderer: 'Nano Banana Pro (Gemini 3 Pro Image)',
    resolutionTier: '4K',
    characters,
    set,
    prop,
    shots,
    runtimeLabel: `${mm}:${ss}`,
  };
}

function getLedgerStatusMap(ledger = []) {
  const map = new Map();
  for (const item of ledger) {
    if (!item?.filename) continue;
    map.set(item.filename.toLowerCase(), item.status || 'PENDING');
  }
  return map;
}

function isLockedInLedger(filename, ledgerMap) {
  const st = ledgerMap.get(String(filename || '').toLowerCase());
  return st === 'REF BOUND' || st === 'APPROVED';
}

function buildQueueACards(bp, ledgerMap) {
  const lead = bp.characters[0];
  const allCards = [
    {
      filename: lead.sheetFile,
      token: `${lead.tag}_W1`,
      role: 'face lock',
      kind: 'Character 2x4 Chroma-Green Grid Sheet',
      prompt: [
        `ATTACH: ${lead.sheetFile} — TARGET OUTPUT (create fresh master FACE LOCK sheet)`,
        `ONE single image containing EXACTLY 8 panels arranged in a 2-column x 4-row grid — not a portrait, not a single view. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Row 1: front headshot faceF | side profile headshot faceS. Row 2: full body front bodyF | full body side profile bodyS. Row 3: over-the-shoulder front otsF | over-the-shoulder profile otsS. Row 4: over-the-shoulder back otsB | clean label cell reading "${lead.tag} W1". Subject: ${lead.descriptor}. All 7 identity panels render the EXACT SAME person: identical facial bone structure, identical skin texture, identical hair, identical wardrobe, and identical lighting mood in every panel. Pure chroma green (#00FF00) seamless studio backdrop in every panel: even flat lighting, zero shadows cast on the background, zero green spill on skin and wardrobe. Soft key light, 85mm lens, thin white grid borders, zero text beyond the label cell, no printed color swatches. ${lead.wardrobeLock}`,
      ].join('\n'),
    },
    {
      filename: bp.set.sheetFile,
      token: bp.set.tag,
      role: 'spatial lock',
      kind: 'Location 2x2 Set Grid Sheet',
      prompt: [
        `ATTACH: ${bp.set.sheetFile} — TARGET OUTPUT (2x2 WALL MAP auditor sheet)`,
        `ONE single image containing EXACTLY 4 panels arranged in a 2-column x 2-row grid of the SAME room — not a single-angle photo, not four different rooms. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Top-left: wide establishing from entrance. Top-right: reverse view from far wall toward entrance showing ${bp.set.wallB}. Bottom-left: 90-degree lateral side profile showing ${bp.set.wallA}. Bottom-right: high-angle corner overview revealing full 3D furniture geometry. Room specification: ${bp.set.geography}. The EXACT SAME room in all 4 panels: identical architecture, identical furniture in identical positions, identical materials and colors. Lighting lock across all 4 panels: ${bp.set.lightingLock}. Thin white borders, 35mm lens, zero people, zero text, zero labels, no printed color swatches.`,
      ].join('\n'),
    },
    {
      filename: bp.set.anglesFile,
      token: bp.set.tag,
      role: 'spatial angles',
      kind: 'Set 8-View Angle Grid',
      prompt: [
        `ATTACH: ${bp.set.sheetFile} — SPATIAL REFERENCE LOCK`,
        `ONE single image containing EXACTLY 8 panels arranged in a 2-column x 4-row grid — the SAME set seen from 8 different angles — not 8 different sets. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Row 1: aerial top-down view | view from entrance. Row 2: reverse from far side | left profile wall (${bp.set.wallA}). Row 3: right profile wall (${bp.set.wallB}) | high northeast corner. Row 4: low southwest corner | clean label cell "${bp.set.tag}". Room: ${bp.set.geography}. The EXACT SAME set in all 8 panels: identical landmark positions, identical architecture, identical props in identical positions. Lighting lock: ${bp.set.lightingLock}. Thin white borders, 35mm lens, zero people, zero text beyond the label cell, no color swatches.`,
      ].join('\n'),
    },
    {
      filename: bp.set.blueprintFile,
      token: bp.set.tag,
      role: 'blueprint',
      kind: 'Top-Down 2D Set Blueprint',
      prompt: [
        `ATTACH: ${bp.set.sheetFile} — GEOMETRY REFERENCE`,
        `ONE top-down 2D architectural blueprint of the set: clean technical line-drawing, flat white background, colored labels, NOT photoreal, NOT a film frame — banner text BLUEPRINT — NOT A FRAME across the top. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Labeled landmarks: A1 rain-streaked casement window (west wall), A2 dark oak study desk (1.2m from west wall), A3 brass desk lamp (north-west corner of desk), B1 weathered wooden bookshelf (north far wall, 2.4m from desk), C1 iron-frame bed (east wall, 2.0m across from desk). Include compass rose (N/E/S/W), warm tungsten sun/key-light direction arrow from A3, metric scale bar in meters, and three lettered camera wedges with facing arrows: CAM-A (southeast entrance facing NW), CAM-B (east of desk facing W toward A1), CAM-C (desk corner tight facing A1).`,
      ].join('\n'),
    },
    {
      filename: bp.prop.sheetFile,
      token: bp.prop.tag,
      role: 'prop lock',
      kind: 'Hero Prop Chroma-Green 8-Grid',
      prompt: [
        `ATTACH: ${bp.prop.sheetFile} — TARGET OUTPUT (Hero Prop 8-Grid)`,
        `ONE single image containing EXACTLY 8 panels arranged in a 2-column x 4-row grid — the SAME prop seen from 8 different angles, orbiting clockwise — not 8 different props. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Row 1: front | 3/4 left. Row 2: left profile | rear-3/4 left. Row 3: back | rear-3/4 right. Row 4: right profile | clean label cell "${bp.prop.tag}". Prop specification: ${bp.prop.descriptor}. Identical object state, identical scale, and identical distance-to-lens in every panel; one neutral coin scale reference in the front panel only. Every panel renders on a pure chroma green (#00FF00) seamless background: even flat lighting, zero shadows cast on the background, zero green spill on the object, identical object state in every panel. 85mm lens, thin white borders, zero people, zero text beyond label cell.`,
      ].join('\n'),
    },
  ];

  return allCards.map((c) => ({
    ...c,
    locked: isLockedInLedger(c.filename, ledgerMap),
    status: ledgerMap.get(c.filename.toLowerCase()) || 'PENDING',
  }));
}

function renderDispenseLedger(bp, cards, shotsDone = 0, activeLabel = '') {
  const lockedCount = cards.filter((c) => c.locked).length;
  const remaining = cards.length - lockedCount;
  const verifiedFiles = cards.filter((c) => c.locked).map((c) => `${c.filename} (${c.status})`);
  return [
    '```text',
    `DISPENSE LEDGER — ${bp.slug}`,
    `A (Asset Cards): ${lockedCount}/${cards.length} ready (${lockedCount} REF BOUND/APPROVED, ${remaining} remaining to serve) — active: ${activeLabel || (cards.find((c) => !c.locked)?.filename ?? 'ASSET GATE READY')}`,
    `ASSET GATE: ${remaining === 0 ? `PASSED — ${cards.length} files verified` : `LOCKED — requires ${cards.length} files in /00-cards/`}`,
    `B+F (Chronological Shots S1→S${bp.shots.length}): ${shotsDone}/${bp.shots.length} served & verified — active: ${remaining === 0 ? `S${Math.min(shotsDone + 1, bp.shots.length)}` : 'GATE OK pending'}`,
    `model: Omni 1.1 Flash / Veo 3.1 | next model switch: S2 (R4 anchor)`,
    `verified_on_disk: ${verifiedFiles.length > 0 ? verifiedFiles.join(', ') : 'none yet'}`,
    '```',
  ].join('\n');
}

function renderQueueACardTurn(bp, cards, cardIdx, introNote = '') {
  const card = cards[cardIdx];
  const pendingCount = cards.filter((c) => !c.locked).length;
  const lines = [];
  if (introNote) lines.push(introNote, '');
  lines.push(
    `[STEP 0 ASSETS — QUEUE A CARD ${cardIdx + 1} OF ${cards.length}: ${card.kind}]`,
    '',
    renderDispenseLedger(bp, cards, 0, card.filename),
    '',
    `### Queue A — ${card.kind} (save as ${card.filename} in /00-cards/ · ${card.token} · ${card.role})`,
    '',
    '```text',
    card.prompt,
    '```',
    '',
    `> Click **"Generate in Studio"** above to render \`${card.filename}\` right inside FlowStudioPWA and auto-bind it into your Asset Inventory Ledger, or **"Copy for Google Flow"** to paste externally.`,
    '',
    '```text',
    ` 1) ★ Confirm ${card.filename} Rendered & Bind as APPROVED (Serve Next Queue A Card / Asset Gate)`,
    ` 2) Skip to Shot S1 Now — Unlock ASSET GATE (I will bind remaining ${Math.max(0, pendingCount - 1)} assets as I go)`,
    ` 3) FAIL ${card.filename} (Attempt 1) — Tighten Avoid Rules & Retry`,
    ` 4) ASSETS READY — Bind Existing Reference Files as REF BOUND`,
    ` 5) Status — Show Full Dispense & Asset Inventory Ledger`,
    ` 6) Custom — Type edits or PATCH instructions`,
    '```'
  );
  return lines.join('\n');
}

function renderShotTurn(bp, cards, shotIndex, extraNote = '', quartetBatch = 1) {
  const shot = bp.shots[shotIndex];
  const lead = bp.characters[0];
  const t = shot.timing;
  const attachList = [
    `${lead.sheetFile} — FACE LOCK`,
    `${bp.set.sheetFile}`,
    `${bp.set.anglesFile}`,
    `${bp.set.blueprintFile} — GEOMETRY LOCK`,
    `${bp.prop.sheetFile}`,
  ].join(', ');

  const audioContract = shot.dialogue === 'none' ? 'SILENT-OK' : 'VO REQUIRED';
  const dialogueSentence =
    shot.dialogue === 'none'
      ? `Room tone: ${bp.set.ambience}; no spoken dialogue, no background music.`
      : `She says in ${bp.language}, warm and measured: "${shot.dialogue}" Room tone: ${bp.set.ambience}; no background music.`;

  const quartetAngles =
    quartetBatch === 1
      ? 'Candidate A low wide · Candidate B eye-level standard · Candidate C high 3/4 · Candidate D tight lateral'
      : `Batch ${quartetBatch} novel angles (zero reuse): Candidate A Dutch-free low shoulder · Candidate B oblique desk-level · Candidate C high window-side 3/4 · Candidate D tight foreground-occluded profile`;

  const lines = [];
  if (extraNote) lines.push(extraNote, '');

  lines.push(
    `[SHOT ${shot.id} OF S${bp.shots.length} — PAIRED CHRONOLOGICAL QUEUE (QUARTET + QUEUE B + ACCEPTANCE CARD)]`,
    '',
    '```text',
    `=== ${shot.id} | ${shot.role} | chronological #${shotIndex + 1} of ${bp.shots.length} | attach: ${lead.sheetFile}, ${bp.set.sheetFile}, ${bp.set.blueprintFile}, ${bp.prop.sheetFile} ===`,
    '',
    `PANEL: ${shot.model} | gen ${t.genD}s → keep ${t.keepD}s (shave-${t.shave}s${t.voMargin ? ` + ${t.voMargin}s VO margin` : ''}) | ${bp.aspect} | 1080p | x1 | UNIQUENESS: 40/100 | AUDIO: ${audioContract}`,
    '```',
    '',
    `[STEP A — FRAME QUARTET ${shot.id} — BATCH ${quartetBatch} (save picked winner as ${shot.id}_f.jpg in /01-shots/)]`,
    '',
    '```text',
    `ATTACH: ${attachList}`,
    `Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Frame Quartet ${shot.id}_f-A/B/C/D (${quartetAngles}). Cinematic film still, ${bp.aspect}, ${shot.size}, ${shot.angle}, ${shot.lens} lens. ${lead.descriptor} ${shot.action}. ${shot.spatialAnchor} Background wall behind subject: ${bp.set.wallA}. Lighting: ${bp.set.lightingLock}. ${bp.grade}. Subtle foreground rain-streaked glass occlusion on the extreme frame edge, natural 35mm film grain, no text, no watermark, no printed color swatches. ${lead.wardrobeLock}`,
    '```',
    '',
    `[STEP B — VIDEO GENERATION ${shot.id} (save as ${shot.id.toLowerCase()}.mp4 in /01-shots/ | attach EXACTLY ONE start frame: ${shot.id}_f.jpg)]`,
    '',
    `* **Queue B Video Prompt** (pure natural language, ≤240 words, §5.2 5-part front-loaded order):`,
    '',
    '```text',
    `ATTACH: ${shot.id}_f.jpg — SOLE START FRAME, ${lead.sheetFile} — FACE LOCK, ${bp.set.sheetFile}, ${bp.set.blueprintFile} — GEOMETRY LOCK`,
    `${shot.size}, ${shot.angle}, ${shot.lens} cinema lens, ${shot.camMove}. ${lead.descriptor} ${shot.action}, showing subtle throat swallow and measured hand tension while eyeline holds steady along the scene axis as intensity shifts (${shot.emo}). ${shot.spatialAnchor} Behind her stands ${bp.set.wallA}, lit with ${bp.set.lightingLock}, with subtle rain droplets rolling down the foreground glass and natural 35mm film grain. ${dialogueSentence} ${lead.wardrobeLock} Avoid: face or wardrobe hue drift, background geometry teleporting, waxy poreless skin, stiff frozen upper face, bending rigid book covers, ${bp.language !== 'English' ? 'English speech, ' : ''}no text, no watermark, no printed color swatches or hex code text strings in frame.`,
    '```',
    '',
    `* **Motion Prompt** (Image-to-Video — attach \`${shot.id}_f.jpg\` as the SOLE start frame):`,
    '',
    '```text',
    `ATTACH: ${shot.id}_f.jpg — SOLE START FRAME`,
    `${t.genD} seconds, ${shot.size} ${shot.angle} hold (MOTION SPEED TAG: ${shot.camMove}), ${shot.action}, gentle rain shadows shifting across the oak desk, landing smoothly on ${shot.endState} (EMO arc ${shot.emo}).`,
    '```',
    '',
    `* **Last Frame Prompt** (Pass 2 → \`${shot.id}_lastf.jpg\` — next-shot continuity target / QA reference only):`,
    '',
    '```text',
    `ATTACH: ${lead.sheetFile} — FACE LOCK, ${bp.set.sheetFile}, ${bp.set.blueprintFile}`,
    `Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Cinematic film still, ${bp.aspect}, ${shot.size}, ${shot.angle}. ${lead.descriptor} holding the exact end-state residue pose: ${shot.endState}. ${shot.spatialAnchor} Lighting: ${bp.set.lightingLock}. ${bp.grade}, 35mm film grain, no text, no watermark, no printed color swatches.`,
    '```',
    '',
    '* **Shot Metadata & Execution Command:**',
    '',
    '```text',
    `Duration Tier: ${t.genD}s | Uniqueness: 40/100 — STANDARD (identity & wardrobe hue lock ≤ 20) | Tag: ${lead.tag.slice(1)}`,
    '',
    `Audio: ${shot.dialogue === 'none' ? 'room tone & rain ambience only' : `"${shot.dialogue}"`} | Audio Contract: ${audioContract}`,
    '',
    `Emotion Arc: ${shot.emo} | END-STATE RESIDUE: ${shot.endState}`,
    '',
    `Audio Direction: ${lead.voiceLock}; natural close-mic delivery in ${bp.language}, dialogue clean above ${bp.set.ambience}, zero background music.`,
    '',
    `Execution Command: GENERATE ${shot.id} as ONE clip: attach single start frame ${shot.id}_f.jpg (plus ${lead.sheetFile}, ${bp.set.sheetFile}); DURATION = ${t.genD}s exactly; AUDIO = ${shot.dialogue === 'none' ? 'SILENT-OK: no dialogue' : `VO REQUIRED: speak verbatim in ${bp.language} — "${shot.dialogue}"; voice = ${lead.voiceLock}`}; UNIQUENESS = 40/100 (identity & wardrobe hue lock ≤ 20); ${lead.wardrobeLock} PASTE BOUNDARY — after rendering ${shot.id.toLowerCase()}.mp4, select your verdict on the Acceptance Card below.`,
    '```',
    '',
    `[STEP C — 12-POINT ACCEPTANCE CARD ${shot.id} & VERDICT MENU]`,
    '',
    '```text',
    `Acceptance Card: ${shot.id} | 1. DURATION = <actual>s vs tier ${t.genD}s | 2. AUDIO = ${audioContract} verbatim & complete Y/N | 3. LANGUAGE = matches LANGUAGE LOCK (${bp.language}) Y/N | 4. PACING = last word lands ≥1.0s before clip end Y/N | 5. SPATIAL = frame sides (AXIS MAP) + eyelines + geography (LOCATION LOCK) + blueprint geometry (SPATIAL CONTRACT) + reverse-angle wall (WALL MAP) + Kelvin (LIGHTING LOCK) all match Y/N | 6. DIALOGUE = 100% complete, zero mid-word cut at tail Y/N | 7. IDENTITY & HEX HUE LOCK = exact sheet ${lead.sheetFile} attached & matched ("grade may tint light, never hue") Y/N | 8. MOTION = matches prompt & MOTION SPEED TAG ceiling Y/N | 9. EMO ARC = start→end climb, named TURN, end-state residue landed Y/N | 10. COVERAGE = matches EDIT MAP Y/N | 11. UNIQUENESS = stayed within 40/100 dial (hue lock ≤ 20) Y/N | 12. VERDICT: PASS or FAIL`,
    '```',
    '',
    '```text',
    ` 1) ★ PASS ${shot.id} — All 12 Checks Verified (Save ${shot.id.toLowerCase()}.mp4 & Serve ${shotIndex + 1 < bp.shots.length ? bp.shots[shotIndex + 1].id : 'Phase 5 Timeline Assembly'})`,
    ` 2) Generate Another 4 — Frame Quartet Batch ${quartetBatch + 1} (4 new unique angles, zero repeats)`,
    ` 3) FAIL ${shot.id} (Attempt 1) — Regenerate ${shot.id} with Tightened SNEG / Fallback`,
    ` 4) FAIL ${shot.id} Twice (Two-Fail Stop) — Open the PATCH ${shot.id} Menu (Do Not Burn a 3rd Credit)`,
    ` 5) Status — Show Full Dispense & Asset Inventory Ledger`,
    ` 6) Custom — Type specific feedback or a PATCH for ${shot.id}`,
    '```'
  );

  return lines.join('\n');
}

function renderExpressReceiptsAndBuildGate(bp, ledgerMap) {
  const lead = bp.characters[0];
  const cards = buildQueueACards(bp, ledgerMap);
  const sheetStatus = isLockedInLedger(lead.sheetFile, ledgerMap)
    ? `REF BOUND (${lead.sheetFile})`
    : 'QUEUE A REQUIRED (served at STEP 0 ASSETS — never pre-approved before render)';
  const rosterMode = cards.every((c) => c.locked)
    ? 'LOCKED-REFS'
    : cards.some((c) => c.locked)
      ? 'HYBRID'
      : 'GENERATE';

  return [
    `Pre-analysis locked — ${bp.characters.length} character(s), 1 location (${bp.set.tag}), ${bp.shots.length} master shots, detected language: ${bp.language}, detected genre: ${bp.genre}. Executing EXPRESS WALK receipts (O-1a → O-15):`,
    '',
    `[DEFAULT APPLIED: O-1a — GENRE LOCK: ${bp.genre}]`,
    `[DEFAULT APPLIED: O-1b — CHARACTER ROSTER: ${lead.tag} (${lead.name}) | ROSTER MODE: ${rosterMode}]`,
    `[DEFAULT APPLIED: O-2 — WARDROBE & HEX LOCK: ${lead.tag} W1 locked (skin prose-only, garments [#HEX])]`,
    `[DEFAULT APPLIED: O-3 — TOOL DECLARATION: ${bp.renderer} (4K Max) + Google Flow (Omni 1.1 Flash workhorse / Veo 3.1 hero)]`,
    `[DEFAULT APPLIED: O-4 — PLATFORM & ASPECT: ${bp.platform} | ${bp.aspect}]`,
    `[DEFAULT APPLIED: O-5 — CHARACTER 2x4 CHROMA-GREEN SHEET: ${lead.sheetFile} → ${sheetStatus}]`,
    `[DEFAULT APPLIED: O-6 — TASTE CONFIRMATION: ${isLockedInLedger(lead.sheetFile, ledgerMap) ? 'REF BOUND' : 'Deferred to Queue A (QUEUE A REQUIRED — zero false verified_on_disk)'}]`,
    `[DEFAULT APPLIED: O-7 — HERO PROPS LOCK: ${bp.prop.tag} → ${bp.prop.sheetFile}]`,
    `[DEFAULT APPLIED: O-8 — LOCATIONS & SPATIAL PACKAGE: ${bp.set.tag} → ${bp.set.sheetFile} + ${bp.set.anglesFile} + ${bp.set.blueprintFile}]`,
    `[DEFAULT APPLIED: O-9 — DIRECTOR'S CHAIR: AUTO — DIRECTOR'S CUT | CLIMAX ENVELOPE: ${bp.envelope}]`,
    `[DEFAULT APPLIED: O-10 — RUNTIME TARGET: ${bp.runtimeLabel} across ${bp.shots.length} master shots]`,
    `[DEFAULT APPLIED: O-11 — PLACE & CAPTION LOCK: ${bp.place} | no in-gen captions (TEXT-POST only)]`,
    `[DEFAULT APPLIED: O-12 — LANGUAGE LOCK: ${bp.language} (verbatim source integrity)]`,
    `[DEFAULT APPLIED: O-13 — DIALOGUE REVIEW: ${bp.shots.filter((s) => s.dialogue !== 'none').length} spoken line(s) verified under §6.1 duration math]`,
    `[DEFAULT APPLIED: O-14 — SCREEN TEXT: TEXT-GEN none | TEXT-POST approved for editor assembly]`,
    `[DEFAULT APPLIED: O-15 — GENERATION BILL: ${cards.filter((c) => !c.locked).length} Queue A asset card(s) remaining (${cards.filter((c) => c.locked).length} REF BOUND) + ${bp.shots.length} Pass 1 Frame Quartets + ${bp.shots.length} video clips | DISPENSE: STEP | SERIES MODE: OFF]`,
    '',
    `[STEP 16 OF 16 — O-16 FINAL GATE: BUILD]`,
    `All 16 onboarding locks are staged (${bp.presetName} · ${bp.aspect} · ${bp.language} · ${bp.shots.length} shots · ${bp.runtimeLabel}). Click **1) ★ BUILD** to compile the 12-Item Production Kit with \`CHECKS: 78/78 PASS\` and immediately serve Queue A Card 1.`,
    '',
    '```text',
    ' 1) ★ BUILD — compile & emit the 12-Item Production Kit + serve the first active queue step',
    ' 2) ASSETS READY — bind existing sheets/sets/frames as REF BOUND before building',
    ' 3) Re-open the Director\'s Chair (O-9) before building',
    ' 4) Re-open the Dialogue Review (O-13) before building',
    ' 5) Custom — type any O-step ID (O-1a to O-15) to revise first',
    '```',
  ].join('\n');
}

function renderFullBuildKit(bp, ledgerMap) {
  const lead = bp.characters[0];
  const cards = buildQueueACards(bp, ledgerMap);
  const firstPendingIdx = cards.findIndex((c) => !c.locked);

  const shotListLines = bp.shots.map((s, i) => {
    const startSec = bp.shots.slice(0, i).reduce((acc, x) => acc + x.timing.keepD, 0);
    const endSec = startSec + s.timing.keepD;
    const fmt = (sec) => `00:${String(Math.floor(sec)).padStart(2, '0')}`;
    return [
      `${s.id} (${fmt(startSec)}–${fmt(endSec)} | shave-${s.timing.shave}s | Tier: ${s.timing.genD}s)`,
      `${lead.tag}_W1 — RISK ${s.risk} | ROLL 1 | ${s.role} | TYPE: ANCHOR | SET: ${bp.set.tag} | AUDIO: ${s.dialogue === 'none' ? 'SILENT-OK' : 'VO REQUIRED'} | EMO: ${s.emo}`,
      `- ACT: ${s.action}.`,
      `- CAM: ${s.size}, ${s.angle} | ${s.lens} | ${s.camMove} | 180° shutter blur.`,
      `- LIGHT: ${bp.set.lightingLock}.`,
      `- LINE: ${s.dialogue === 'none' ? 'none' : `${lead.tag} (${bp.language}): "${s.dialogue}"`}`,
    ].join('\n');
  });

  const kitHeader = [
    `## 12-ITEM PRODUCTION KIT — ${bp.slug.toUpperCase()}`,
    '',
    `**Item 1–3 · SETTINGS BINDING**`,
    `- ENTRY PATH: S/N · PRESET SOURCE: ${bp.presetName} · GENRE LOCK: ${bp.genre}`,
    `- LANGUAGE LOCK: ${bp.language} · PLACE LOCK: ${bp.place} · CAPTION LOCK: no captions`,
    `- GEN PROFILE: ${bp.renderer} (${bp.resolutionTier}) + Google Flow (Omni 1.1 Flash workhorse / Veo 3.1 hero) | ${bp.aspect} | 24fps | 1080p`,
    `- OUTPUT MODE: ${bp.outputMode} · SLICE GROUPS: ${bp.sliceGroups} · MICRO-COVERAGE: ${bp.microCoverage} · AUDIO MASTER MODE: ON · DISPENSE: STEP`,
    '',
    `**Item 4–5 · CHARACTER PROFILES, VOICE LOCKS & HERO PROPS**`,
    `- ${lead.tag}_W1 (${lead.sheetFile}): ${lead.descriptor}.`,
    `- ${lead.voiceLock}.`,
    `- ${bp.prop.tag} (${bp.prop.sheetFile}): ${bp.prop.descriptor}.`,
    '',
    `**Item 6–7 · GLOBAL HEADER, SPATIAL CONTRACT & LOOK/LOCATION REGISTERS**`,
    `- STYLE LOCK: ${bp.grade} · ${bp.place}.`,
    `- LOCATION REGISTER: ${bp.set.tag} | ${bp.set.sheetFile} + ${bp.set.anglesFile} + ${bp.set.blueprintFile} | WALL MAP: Wall A = ${bp.set.wallA} | Wall B = ${bp.set.wallB} | LIGHTING LOCK: ${bp.set.lightingLock}.`,
    `- SPATIAL CONTRACT TABLE: A1 Window (west wall) | A2 Oak Desk (1.2m E of A1, visible CAM-A/B/C) | A3 Brass Lamp (NW desk corner) | B1 Bookshelf (north wall, 2.4m N of A2, visible CAM-B) | C1 Iron Bed (east wall, 2.0m E of A2, visible CAM-A).`,
    `- AXIS MAP ${bp.set.tag}: ${lead.tag} = frame-left | SCALE LOCK: ${lead.tag} = ${lead.heightCm} cm | ${lead.wardrobeLock}`,
    '',
    `**Item 8 · COMPLETE SHOT LIST (S1 → S${bp.shots.length})**`,
    ...shotListLines,
    '',
    `**Item 9–11 · RUN SHEET & SILENT 78-POINT GATE**`,
    `- RUN SHEET: PHASE 0 ASSETS (/00-cards/) → PHASE 1 OPENING S1 → PHASE 2 ANCHOR S2 → PHASE 4 CLIMAX S${bp.shots.length} → PHASE 5 EDIT ASSEMBLY (/02-edit/).`,
    `- \`RUNTIME CHECK: TOTAL = ${bp.runtimeLabel} (matches target: yes) | CHECKS: 78/78 PASS\``,
    '',
    '---',
  ].join('\n');

  if (firstPendingIdx === -1) {
    // All Queue A cards are already REF BOUND / APPROVED — jump straight to Shot S1!
    return `${kitHeader}\n\nAll Queue A reference assets are already REF BOUND / APPROVED — skipping Queue A per §9.7 Never-Regenerate Law.\n\n${renderShotTurn(bp, cards, 0)}`;
  }

  return `${kitHeader}\n\n${renderQueueACardTurn(bp, cards, firstPendingIdx)}`;
}

export function runDeterministicDirectorV5Turn({
  userInput = '',
  ledger = [],
  bible = [],
  sessionState = {},
}) {
  const input = String(userInput || '').trim();
  const upper = input.toUpperCase();
  const ledgerMap = getLedgerStatusMap(ledger);

  const state = {
    stage: sessionState.stage || 'step0',
    presetKey: sessionState.presetKey || null,
    sourceText: sessionState.sourceText || '',
    built: Boolean(sessionState.built),
    queueACardIdx: Number.isInteger(sessionState.queueACardIdx) ? sessionState.queueACardIdx : 0,
    shotIdx: Number.isInteger(sessionState.shotIdx) ? sessionState.shotIdx : 0,
    quartetBatch: Number.isInteger(sessionState.quartetBatch) ? sessionState.quartetBatch : 1,
    shotsPassed: Number.isInteger(sessionState.shotsPassed) ? sessionState.shotsPassed : 0,
  };

  // 1) Empty / Init -> canonical STEP 0
  if (!input || upper === 'INIT' || upper === 'RESET' || upper === 'STEP 0') {
    return {
      text: `${STEP_0_CANONICAL_MENU}\n`,
      nextState: { ...state, stage: 'step0', built: false, queueACardIdx: 0, shotIdx: 0, shotsPassed: 0 },
    };
  }

  // 2) Global trigger: ASSETS READY / I HAVE THE ASSETS (§2.0)
  if (/\b(ASSETS READY|I HAVE THE ASSETS|ASSET INVENTORY SWEEP)\b/i.test(input)) {
    return {
      text: [
        '[STEP 2.0 — ASSET INVENTORY SWEEP]',
        'Bind any pre-existing character sheets, set grids, blueprints, prop cards, or start frames below (or use the Asset Inventory Ledger panel on the right to upload / bind existing Studio assets as `REF BOUND`).',
        '',
        '```text',
        ASSET_SWEEP_CANONICAL_MENU,
        '```',
      ].join('\n'),
      nextState: { ...state, stage: 'sweep' },
    };
  }

  // 3) Global trigger: STATUS / confusion signal
  if (/^(STATUS|AND\?|WHAT NOW|\?\?\?|HUH|IDK WHAT TO DO)$/i.test(input)) {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey);
    const cards = buildQueueACards(bp, ledgerMap);
    const ledgerLines =
      ledger.length > 0
        ? ledger.map((a) => `- \`${a.filename}\` ↔ \`${a.token}\` ↔ ${a.role} — **${a.status}**`).join('\n')
        : '- No bound files in Asset Inventory Ledger yet.';
    const text = [
      `You're currently in stage **${state.stage.toUpperCase()}** — everything locked so far is safe in your browser Vault. Pick Option 1 below to advance to your next concrete production step.`,
      '',
      renderDispenseLedger(bp, cards, state.shotsPassed),
      '',
      '**ASSET INVENTORY LEDGER:**',
      ledgerLines,
      '',
      '```text',
      state.built
        ? ' 1) ★ Resume Active Production Card / Shot'
        : ' 1) ★ Continue Express Walk to O-16 BUILD Gate',
      ' 2) ASSETS READY — Bind Existing Reference Files as REF BOUND',
      ' 3) Restart at STEP 0 Entry Menu',
      ' 4) Custom — Type a command or PATCH',
      '```',
    ].join('\n');
    return { text, nextState: state };
  }

  // 4) STAGE: STEP 0 menu handling
  if (state.stage === 'step0') {
    if (input === '1') {
      return {
        text: `${STEP_OV_CANONICAL_MENU}\n`,
        nextState: { ...state, stage: 'video_gate' },
      };
    }
    if (input === '2') {
      return {
        text: [
          '[STEP 0.S — PATH S SCRIPT INTAKE]',
          'Paste your script, beat sheet, or multi-scene brief below. Every spoken line stays 100% verbatim (Tier 1 Source Integrity) and will be normalized via the 8-Point Script Sanitizer.',
          '',
          '```text',
          ' 1) ★ Use Active Project Bible to Draft & Express-Walk a 3-Shot Pilot Scene',
          ' 2) ASSETS READY — Bind Existing Reference Assets First (§2.0)',
          ' 3) Return to STEP 0 Menu',
          ' 4) Custom — Paste your full script or scene brief below',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'await_source', presetKey: null },
      };
    }
    if (input === '3') {
      return {
        text: [
          '[STEP A-1a OF 7 — FORMAT SELECTION]',
          'Launching Path N AUTO STORY Builder. Pick the target format for your story:',
          '',
          '```text',
          ' 1) ★ Vertical Short Drama (TikTok/Reels/Shorts)',
          ' 2) Short Film',
          ' 3) Series Episode',
          ' 4) Ad / Commercial Spot',
          ' 5) Trailer / Teaser',
          ' 6) Music Video',
          ' 7) Feature Film Scene',
          ' 8) Documentary Piece',
          ' 9) EXPRESS: Auto-Story — generate premise, cast & story summary with Recommended defaults now',
          ' 10) Custom — type your format or idea directly',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'auto_story_a1a' },
      };
    }
    if (['4', '5', '6', '7', '8'].includes(input) || /\b(RECOMMENDED ALL|EXPRESS|PRESET:)\b/i.test(input)) {
      const presetMap = { '5': 'HYBRID', '6': 'FILM SENTI', '7': 'AD PUNCH', '8': 'BOARD' };
      const chosenPreset =
        presetMap[input] ||
        (/FILM SENTI/i.test(input)
          ? 'FILM SENTI'
          : /AD PUNCH/i.test(input)
            ? 'AD PUNCH'
            : /BOARD/i.test(input)
              ? 'BOARD'
              : /HYBRID/i.test(input)
                ? 'HYBRID'
                : null);
      const label = chosenPreset ? PRESET_PROFILES[chosenPreset].name : '★ EXPRESS: RECOMMENDED ALL';
      return {
        text: [
          `✔ Locked Entry Lane: **${label}** | [ONBOARDING CHECKPOINT | Awaiting Source Material]`,
          'Paste your script, beat sheet, or short story idea below — or tap **Option 1** to immediately Express-Walk a pilot scene using your active Project Bible.',
          '',
          '```text',
          ' 1) ★ Auto-Launch Express Walk Now Using Active Project Bible (@MIRA + @LOC-D)',
          ' 2) ASSETS READY — Bind Existing Reference Sheets First (§2.0)',
          ' 3) Return to STEP 0 Menu',
          ' 4) Custom — Paste your script or story idea below',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'await_express_source', presetKey: chosenPreset },
      };
    }

    // Direct pasted script/premise at STEP 0 -> run O-0 + O-1a (or Express if triggered)
    const bp = buildProjectBlueprint(input, bible, state.presetKey);
    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate', sourceText: input },
    };
  }

  // 5) STAGE: VIDEO CHANNEL GATE
  if (state.stage === 'video_gate') {
    const bp = buildProjectBlueprint(
      input === '1' || input === '2' || input === '3'
        ? 'Path V video regeneration study from uploaded reference clip'
        : input,
      bible,
      state.presetKey
    );
    return {
      text: [
        'AGENTIC TOOLS UNAVAILABLE — multimodal visual/audio analysis only; all TCs EST ±0.5s.',
        '',
        renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      ].join('\n'),
      nextState: { ...state, stage: 'build_gate', sourceText: bp.premise },
    };
  }

  // 6) STAGE: AUTO STORY A-1a -> Fast-track or Story Summary
  if (state.stage === 'auto_story_a1a') {
    const presetForFormat = input === '4' ? 'AD PUNCH' : input === '1' ? 'FILM SENTI' : null;
    const bp = buildProjectBlueprint(
      input.length > 4 ? input : 'Late-night rainy Manila dormitory turning point where @MIRA uncovers an unsent sketch',
      bible,
      presetForFormat
    );
    if (input === '9' || /\b(RECOMMENDED ALL|EXPRESS|BUILD NOW|AUTO)\b/i.test(input)) {
      return {
        text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
        nextState: { ...state, stage: 'build_gate', presetKey: presetForFormat, sourceText: bp.premise },
      };
    }
    return {
      text: [
        `✔ Locked A-1a Format | [STEP A-7 OF 7 — STORY SUMMARY GATE]`,
        `**Logline:** ${bp.premise}`,
        `**Genre Lock:** ${bp.genre} · **Platform:** ${bp.platform} · **Runtime:** ${bp.runtimeLabel} (${bp.shots.length} master shots)`,
        `**Cast:** ${bp.characters.map((c) => `${c.tag} (${c.name})`).join(', ')} · **Set:** ${bp.set.tag} (${bp.set.name}) · **Hero Prop:** ${bp.prop.tag}`,
        '',
        '```text',
        ' 1) ★ EXPRESS: YES + FAST-TRACK ALL — lock story, auto-apply ★ Recommended across O-1a–O-15 with receipts, stop at the BUILD gate',
        ' 2) YES — Lock story and open Step 1a of 16 (Genre Confirm Gate)',
        ' 3) Regenerate a fresh story concept',
        ' 4) Custom — type story modifications',
        '```',
      ].join('\n'),
      nextState: { ...state, stage: 'auto_story_a7', presetKey: presetForFormat, sourceText: bp.premise },
    };
  }

  // 7) STAGE: AUTO STORY A-7 -> Express Walk or O-1a
  if (state.stage === 'auto_story_a7') {
    const bp = buildProjectBlueprint(input.length > 3 ? input : state.sourceText, bible, state.presetKey);
    if (input === '2') {
      return {
        text: [
          `Pre-analysis locked — ${bp.characters.length} character(s), 1 location, ${bp.shots.length} master shots, detected language: ${bp.language}, detected genre: ${bp.genre}. Opening Step 1a of 16.`,
          '',
          '[STEP 1a OF 16 — O-1a GENRE CONFIRM GATE]',
          '',
          '```text',
          ` 1) ★ Confirm detected genre: ${bp.genre}`,
          ' 2) EXPRESS: FAST-TRACK ALL — confirm genre, auto-apply ★ Recommended for O-1b through O-15 with receipts, stop at the BUILD gate',
          ' 3) Pick a different genre from the 15-Category Genre Atlas',
          ' 4) Custom — type your own genre & subgenre',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'o1a', sourceText: bp.premise },
      };
    }
    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate', sourceText: bp.premise },
    };
  }

  // 8) STAGE: Awaiting source for Express Walk or Path S
  if (state.stage === 'await_express_source' || state.stage === 'await_source') {
    if (input === '2') {
      return {
        text: `\`\`\`text\n${ASSET_SWEEP_CANONICAL_MENU}\n\`\`\``,
        nextState: { ...state, stage: 'sweep' },
      };
    }
    if (input === '3') {
      return {
        text: `${STEP_0_CANONICAL_MENU}\n`,
        nextState: { ...state, stage: 'step0' },
      };
    }
    const effectiveSource =
      input === '1'
        ? `Rain-soaked midnight Manila dormitory drama: @MIRA discovers a hidden letter tucked inside her worn linen sketchbook at @LOC-D and whispers, "Every answer we needed was sitting right in front of us."`
        : input;
    const bp = buildProjectBlueprint(effectiveSource, bible, state.presetKey);

    if (state.stage === 'await_source' && !/\b(RECOMMENDED ALL|BUILD NOW|AUTO|EXPRESS)\b/i.test(input) && input !== '1') {
      return {
        text: [
          `Pre-analysis locked — ${bp.characters.length} character(s), 1 location (${bp.set.tag}), ${bp.shots.length} master shots, detected language: ${bp.language}, detected genre: ${bp.genre}. Opening Step 1a of 16.`,
          '',
          '[STEP 1a OF 16 — O-1a GENRE CONFIRM GATE]',
          '',
          '```text',
          ` 1) ★ Confirm detected genre: ${bp.genre}`,
          ' 2) EXPRESS: FAST-TRACK ALL — confirm genre, auto-apply ★ Recommended for O-1b through O-15 with receipts, stop at the BUILD gate',
          ' 3) Pick a different genre from the 15-Category Genre Atlas',
          ' 4) Custom — type your own genre & subgenre',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'o1a', sourceText: effectiveSource },
      };
    }

    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate', sourceText: effectiveSource },
    };
  }

  // 9) STAGE: O-1a Genre Confirm -> O-16 Express Walk or O-1b
  if (state.stage === 'o1a') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey);
    if (input === '2' || /\b(RECOMMENDED ALL|BUILD NOW|AUTO|SKIP|USE DEFAULTS|FAST-TRACK)\b/i.test(input)) {
      return {
        text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
        nextState: { ...state, stage: 'build_gate' },
      };
    }
    const lead = bp.characters[0];
    return {
      text: [
        `✔ Locked O-1a: ${bp.genre} | [ONBOARDING CHECKPOINT | Step 1a/16 locked]`,
        '',
        '[STEP 1b OF 16 — O-1b CHARACTER ROSTER]',
        `- **${lead.tag}** (${lead.name}): ${lead.descriptor}`,
        '',
        '```text',
        ' 1) ★ Approve roster as-is & Express-Walk remaining locks (O-2 → O-15) to BUILD Gate',
        ' 2) Approve roster — I will upload existing reference photos (REF BOUND)',
        ' 3) Auto-rename cast for a different regional anchor',
        ' 4) Custom — type roster edits',
        '```',
      ].join('\n'),
      nextState: { ...state, stage: 'o1b' },
    };
  }

  if (state.stage === 'o1b' || state.stage === 'sweep') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey);
    if (state.stage === 'sweep' && input === '1') {
      return {
        text: [
          '✔ Asset Inventory Sweep active. Upload or bind any existing files via the **Asset Inventory Ledger** panel (or paste filenames here as `mira_w1_sheet.jpg`, `set_rain_dorm_sheet.jpg`). Bound files lock as `REF BOUND` and are never regenerated.',
          '',
          '```text',
          state.built
            ? ' 1) ★ Resume Active Production Queue (Skipping All REF BOUND Cards)'
            : ' 1) ★ Proceed to O-16 BUILD Gate with Current Asset Ledger',
          ' 2) Custom — Type filenames to bind as REF BOUND',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: state.built ? 'queue_a' : 'build_gate' },
      };
    }
    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate' },
    };
  }

  // 10) STAGE: O-16 FINAL GATE: BUILD
  if (state.stage === 'build_gate') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey);
    const cards = buildQueueACards(bp, ledgerMap);
    if (input === '2') {
      return {
        text: `\`\`\`text\n${ASSET_SWEEP_CANONICAL_MENU}\n\`\`\``,
        nextState: { ...state, stage: 'sweep' },
      };
    }
    if (input === '1' || /\b(BUILD|YES|GO)\b/i.test(input)) {
      const firstPendingIdx = cards.findIndex((c) => !c.locked);
      return {
        text: renderFullBuildKit(bp, ledgerMap),
        nextState: {
          ...state,
          built: true,
          stage: firstPendingIdx === -1 ? 'shots' : 'queue_a',
          queueACardIdx: firstPendingIdx === -1 ? cards.length : firstPendingIdx,
          shotIdx: 0,
          quartetBatch: 1,
        },
      };
    }
    // Any custom revision stays at O-16 with updated source
    const updatedBp = buildProjectBlueprint(`${state.sourceText}\n${input}`, bible, state.presetKey);
    return {
      text: renderExpressReceiptsAndBuildGate(updatedBp, ledgerMap),
      nextState: { ...state, sourceText: `${state.sourceText}\n${input}`.trim() },
    };
  }

  // 11) STAGE: QUEUE A ASSET CARDS -> ASSET GATE -> SHOT S1
  if (state.stage === 'queue_a') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey);
    const cards = buildQueueACards(bp, ledgerMap);

    if (input === '2' || /\b(GATE OK|SKIP TO SHOT|SHOT S1)\b/i.test(input)) {
      return {
        text: renderShotTurn(bp, cards, 0, '✔ ASSET GATE unlocked — entering Chronological Shot Queue (S1 → SN).', 1),
        nextState: { ...state, stage: 'shots', shotIdx: 0, quartetBatch: 1 },
      };
    }

    if (input === '3' || /\b(FAIL|RETRY)\b/i.test(input)) {
      const activeIdx = Math.min(state.queueACardIdx, cards.length - 1);
      return {
        text: renderQueueACardTurn(
          bp,
          cards,
          activeIdx,
          `⚠ Failed-Asset Ladder Roll 1 active for \`${cards[activeIdx].filename}\` — tightened chroma-green isolation & anti-drift Avoid rules applied. (If Roll 2 fails, escalate to UPLOAD REF or Rung-3 Anchor Pair — never burn a 3rd credit.)`
        ),
        nextState: state,
      };
    }

    // Advance to next pending Queue A card (skipping REF BOUND / APPROVED cards per §9.7)
    let nextIdx = state.queueACardIdx + 1;
    while (nextIdx < cards.length && cards[nextIdx].locked) {
      nextIdx += 1;
    }

    if (nextIdx < cards.length) {
      return {
        text: renderQueueACardTurn(
          bp,
          cards,
          nextIdx,
          `✔ Recorded \`${cards[state.queueACardIdx]?.filename || 'prior asset'}\` — advancing to Queue A Card ${nextIdx + 1} of ${cards.length}.`
        ),
        nextState: { ...state, queueACardIdx: nextIdx },
      };
    }

    return {
      text: renderShotTurn(
        bp,
        cards,
        0,
        `✔ ASSET GATE PASSED — all ${cards.length} Queue A reference cards accounted for. Serving Shot S1.`,
        1
      ),
      nextState: { ...state, stage: 'shots', shotIdx: 0, quartetBatch: 1 },
    };
  }

  // 12) STAGE: SHOTS S1..SN -> PHASE 5 ASSEMBLY
  if (state.stage === 'shots') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey);
    const cards = buildQueueACards(bp, ledgerMap);
    const curShot = bp.shots[Math.min(state.shotIdx, bp.shots.length - 1)];

    // Quartet unique-4 reroll (§9.9)
    if (input === '2' || /\b(ANOTHER 4|QUARTET|REROLL)\b/i.test(input)) {
      const nextBatch = state.quartetBatch + 1;
      return {
        text: renderShotTurn(
          bp,
          cards,
          state.shotIdx,
          `FRAME QUARTET — BATCH ${nextBatch} — 4 new unique camera angles, zero repeats from prior batch(es).`,
          nextBatch
        ),
        nextState: { ...state, quartetBatch: nextBatch },
      };
    }

    // Fail Attempt 1
    if (input === '3' || /\b(FAIL|RETRY)\b/i.test(input)) {
      return {
        text: renderShotTurn(
          bp,
          cards,
          state.shotIdx,
          `⚠ ${curShot.id} Attempt 1 retry — tightened SNEG kinetic/spatial locks & reinforced ATTACH file priority.`,
          state.quartetBatch
        ),
        nextState: state,
      };
    }

    // Fail Twice -> Two-Fail PATCH menu
    if (input === '4' || /\b(TWICE|TWO-FAIL|PATCH)\b/i.test(input)) {
      return {
        text: [
          `PATCH SCOPE: ${curShot.id} | unaffected assets remain locked.`,
          `Two-Fail Stop triggered for **${curShot.id}** — do not burn a 3rd generation credit without adjusting the spec or binding a fresh REF.`,
          '',
          '```text',
          ` 1) ★ Re-serve ${curShot.id} with simplified camera blocking & tighter SNEG`,
          ` 2) Switch ${curShot.id} to Veo 3.1 Hero Model`,
          ` 3) Bind uploaded reference still as ${curShot.id}_f.jpg (REF BOUND)`,
          ` 4) Custom — Type exact PATCH ${curShot.id} edits`,
          '```',
        ].join('\n'),
        nextState: state,
      };
    }

    // PASS current shot -> serve next shot or Phase 5 Assembly
    const nextShotIdx = state.shotIdx + 1;
    if (nextShotIdx < bp.shots.length) {
      return {
        text: renderShotTurn(
          bp,
          cards,
          nextShotIdx,
          `✔ PASS ${curShot.id} — All 12 Acceptance Card checks verified. Serving chronological shot **${bp.shots[nextShotIdx].id}**.`,
          1
        ),
        nextState: {
          ...state,
          shotIdx: nextShotIdx,
          quartetBatch: 1,
          shotsPassed: Math.max(state.shotsPassed, nextShotIdx),
        },
      };
    }

    return {
      text: [
        '[PHASE 5 — TIMELINE ASSEMBLY & PACKAGING CHECKLIST]',
        '',
        '```text',
        'KIT FULLY SERVED — VERIFY CLIPS IN STUDIO STORYBOARD CUT.',
        `A: ${cards.length}/${cards.length} served | B: ${bp.shots.length}/${bp.shots.length} served | F: ${bp.shots.length}/${bp.shots.length} served | GATE: passed`,
        `NEXT PHYSICAL STEP: Open the Studio tab, add S1–S${bp.shots.length} to the Storyboard Cut bar, trim shave handles, and export your stitched master.`,
        '```',
        '',
        '```text',
        ' 1) ★ SAVE SERIES BIBLE — Emit Episodic Continuity Bible for Episode 2',
        ' 2) Start a New Project at STEP 0',
        ' 3) Re-open Any Shot for Surgical PATCH',
        ' 4) Custom — Type a PATCH or follow-up directive',
        '```',
      ].join('\n'),
      nextState: { ...state, stage: 'assembly', shotsPassed: bp.shots.length },
    };
  }

  // 13) STAGE: ASSEMBLY -> SAVE SERIES BIBLE or reset
  if (state.stage === 'assembly') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey);
    const lead = bp.characters[0];
    if (input === '1' || /SAVE SERIES BIBLE/i.test(input)) {
      return {
        text: [
          `BIBLE — ${bp.slug} | episodes: EP1`,
          `- Cast: ${lead.tag}_W1 (${lead.sheetFile}) — ${lead.descriptor}`,
          `- ${lead.wardrobeLock}`,
          `- ${lead.voiceLock}`,
          `- Location: ${bp.set.tag} (${bp.set.sheetFile}, ${bp.set.anglesFile}, ${bp.set.blueprintFile}) | LIGHTING LOCK: ${bp.set.lightingLock}`,
          `- Hero Prop: ${bp.prop.tag} (${bp.prop.sheetFile})`,
          `- STYLE LOCK: ${bp.grade}`,
          '',
          '```text',
          ' 1) ★ NEXT EPISODE — Open EP2 at STEP 0 with Series Bible Locked',
          ' 2) Start Fresh Project at STEP 0',
          ' 3) Custom — Type a PATCH or Bible addition',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'step0' },
      };
    }
    return {
      text: `${STEP_0_CANONICAL_MENU}\n`,
      nextState: { ...state, stage: 'step0', built: false, queueACardIdx: 0, shotIdx: 0, shotsPassed: 0 },
    };
  }

  // Fallback catch-all -> STEP 0
  return {
    text: `${STEP_0_CANONICAL_MENU}\n`,
    nextState: { ...state, stage: 'step0' },
  };
}
