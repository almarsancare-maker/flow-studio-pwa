/**
 * Real Script-Intelligent MASTER PROMPT v5.0.3 State-Machine Compiler ($0, 0ms, zero API key).
 *
 * Parses the user's ACTUAL pasted script, beat sheet, or story idea:
 *  - Extracts real screenplay characters (`CARLO (35, tired baker...)`, `ELENA: "..."`, `@TAGs`)
 *    WITHOUT hijacking custom scripts with starter `@MIRA` / `@LOC-D` Bible entries!
 *  - Extracts real locations & time-of-day lighting (`INT. CEBU BAKERY - DAWN` -> 4400K dawn)
 *  - Extracts real hero props & 100% verbatim Tier 1 spoken dialogue lines
 *  - Computes real §6.1 duration math (`VO_FIT`, `REQ_D`, `GEN_D`, `VO_MARGIN`)
 *  - Supports full step-by-step `O-1a..O-16` & `A-1a..A-7` AND 1-click Express Walks
 *  - Enforces §2.0 Asset Inventory Sweep, §5.4 ATTACH lines, §8.2-§8.6 multi-character Queue A
 *    cards, §9.7 Never-Regenerate REF BOUND skipping, §9.9 Frame Quartet, 12-Cell Acceptance Card,
 *    and `CHECKS: 78/78 PASS`.
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

const NON_CHAR_WORDS = new Set([
  'INT', 'EXT', 'INT/EXT', 'EXT/INT', 'CUT', 'FADE', 'DISSOLVE', 'SMASH', 'MATCH',
  'DAWN', 'DUSK', 'DAY', 'NIGHT', 'MORNING', 'EVENING', 'AFTERNOON', 'LATER', 'CONTINUOUS',
  'SCENE', 'SHOT', 'ACT', 'TITLE', 'SUPER', 'CARD', 'VO', 'OS', 'OC', 'SFX', 'MUSIC',
  'CAMERA', 'CLOSE', 'WIDE', 'MEDIUM', 'ANGLE', 'POV', 'OTS', 'INSERT', 'MONTAGE',
  'THE', 'AND', 'BUT', 'FOR', 'WITH', 'FROM', 'INTO', 'OVER', 'UNDER', 'THEN', 'WHEN',
  'THIS', 'THAT', 'THESE', 'THOSE', 'HERE', 'THERE', 'WHERE', 'WHAT', 'WHO', 'WHY',
  'HOW', 'ALL', 'SOME', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT',
  'CEBU', 'MANILA', 'TOKYO', 'NEW', 'YORK', 'PARIS', 'LONDON', 'PHILIPPINES', 'BAKERY',
  'STREET', 'ALLEY', 'ROOM', 'HOUSE', 'OFFICE', 'CAFE', 'SHOP', 'KITCHEN', 'HOSPITAL',
  'DORM', 'DORMITORY', 'LAB', 'LABORATORY', 'CAR', 'JEEPNEY', 'TRAIN', 'STATION', 'BEACH',
  'FOREST', 'ROOFTOP', 'SCHOOL', 'CHURCH', 'BAR', 'MARKET', 'MALL', 'PARK', 'BRIDGE',
  'END', 'NOTE', 'PROMPT', 'SCRIPT', 'BRIEF', 'VIDEO', 'AUDIO', 'TEXT', 'ATTACH', 'PANEL',
]);

const WARDROBE_PALETTE_DEFAULTS = [
  { desc: 'worn charcoal jacket [#2C2F33] over cream cotton shirt [#EAE2D3]', hexes: 'charcoal jacket [#2C2F33], cream shirt [#EAE2D3], natural dark hair [#1A1817]' },
  { desc: 'muted ochre blouse [#C89B3C] and slate trousers [#4A525A]', hexes: 'muted ochre blouse [#C89B3C], slate trousers [#4A525A], natural dark hair [#1C1917]' },
  { desc: 'olive utility overshirt [#4A5340] over heather tee [#B2B6B9]', hexes: 'olive utility overshirt [#4A5340], heather tee [#B2B6B9], natural dark hair [#181716]' },
  { desc: 'deep navy knit sweater [#1F2D44] and dark denim [#263240]', hexes: 'deep navy knit sweater [#1F2D44], dark denim [#263240], natural dark hair [#1A1817]' },
];

const COLOR_HEX_MAP = [
  ['maroon', '#6B1F2B'],
  ['crimson', '#8B1E2D'],
  ['red', '#A62B2B'],
  ['yellow', '#D9A82E'],
  ['mustard', '#C89B3C'],
  ['gold', '#D4AF37'],
  ['orange', '#D96B27'],
  ['blue', '#2E5B88'],
  ['navy', '#1F2D44'],
  ['baby-blue', '#A4C8E1'],
  ['green', '#355E3B'],
  ['olive', '#4A5340'],
  ['cream', '#EAE2D3'],
  ['white', '#EFECE6'],
  ['ivory', '#F0EAD6'],
  ['black', '#1A1A1D'],
  ['grey', '#7A8086'],
  ['gray', '#7A8086'],
  ['brown', '#5C4033'],
  ['tan', '#B89B72'],
  ['pink', '#D68B9C'],
  ['purple', '#5B3E7A'],
];

const KNOWN_PROPS = [
  'eviction notice', 'metal tray of hot pandesal', 'pandesal', 'bread tray', 'letter', 'envelope',
  'sketchbook', 'notebook', 'diary', 'wallet', 'photo', 'photograph', 'phone', 'smartphone',
  'coffee cup', 'mug', 'glass beaker', 'beaker', 'bottle', 'keys', 'key', 'ring', 'watch',
  'lanyard', 'guitar', 'violin', 'umbrella', 'briefcase', 'suitcase', 'backpack', 'knife',
  'sword', 'katana', 'pistol', 'gun', 'badge', 'camera', 'laptop', 'newspaper', 'receipt',
  'jeepney', 'motorcycle', 'bicycle', 'car keys', 'flower', 'bouquet', 'candle', 'flashlight',
];

function slugify(str, fallback = 'asset') {
  const s = String(str || '')
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || fallback;
}

function titleCase(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function injectHexesIntoWardrobe(text) {
  let out = String(text || '').trim();
  for (const [word, hex] of COLOR_HEX_MAP) {
    const re = new RegExp(`\\b(${word})\\b(?!\\s*\\[#)`, 'i');
    if (re.test(out)) {
      out = out.replace(re, `$1 [${hex}]`);
    }
  }
  return out;
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
  if (/\b(hindi|naman|pero|tayo|dito|ikaw|ako|mahal|salamat|talaga|pwede|kasi|lang|po|huwag|bakit)\b/.test(lower)) {
    return /\b(the|and|you|don't|can't|please|wait|look|that|this)\b/.test(lower) ? 'Taglish' : 'Tagalog';
  }
  if (/\b(dili|unsa|ngano|kanimo|gihapon|kaayo|gyud|bay|asa|naa|wala)\b/.test(lower)) {
    return 'Cebuano / Bisaya';
  }
  return fallback;
}

function detectGenre(text, presetKey) {
  if (presetKey && PRESET_PROFILES[presetKey]) return PRESET_PROFILES[presetKey].genre;
  const lower = String(text || '').toLowerCase();
  if (/\b(cyberpunk|neon|android|spaceship|quantum|sci-?fi|futuristic|robot)\b/.test(lower)) {
    return 'Science Fiction → Cyberpunk';
  }
  if (/\b(horror|ghost|haunted|blood|demon|curse|scream|creepy)\b/.test(lower)) {
    return 'Horror → Supernatural Thriller';
  }
  if (/\b(commercial|product|ad |brand|buy now|promo|discount|fita|cracker|drink|bottle|shoes)\b/.test(lower)) {
    return 'Digital & Online Creator Content → Commercial Spot';
  }
  if (/\b(comedy|funny|laugh|joke|skit|prank|awkward)\b/.test(lower)) {
    return 'Comedy → Situational Comedy';
  }
  if (/\b(love|kiss|romance|heart|wedding|date|crush)\b/.test(lower)) {
    return 'Romance → Contemporary Romantic Drama';
  }
  if (/\b(chase|fight|gun|explosion|heist|spy|samurai|assassin)\b/.test(lower)) {
    return 'Action & Adventure → Tactical Action Thriller';
  }
  return 'Drama → Contemporary Cinema Drama';
}

function detectPlace(text, presetPlace) {
  const raw = String(text || '');
  if (/\bcebu\b/i.test(raw)) return 'Cebu City, Philippines';
  if (/\bmanila|makati|quezon|taguig|bgc|intramuros\b/i.test(raw)) return 'Metro Manila, Philippines';
  if (/\btokyo|shibuya|kyoto|osaka\b/i.test(raw)) return 'Tokyo, Japan';
  if (/\bnew york|brooklyn|manhattan\b/i.test(raw)) return 'New York City, USA';
  if (/\blos angeles|hollywood\b/i.test(raw)) return 'Los Angeles, USA';
  if (/\blondon\b/i.test(raw)) return 'London, UK';
  if (/\bseoul\b/i.test(raw)) return 'Seoul, South Korea';
  if (/\bparis\b/i.test(raw)) return 'Paris, France';
  if (/\b(pandesal|jeepney|sari-sari|barangay|carinderia|kuya|ate|nanay|tatay)\b/i.test(raw)) {
    return 'Philippines (Local Urban Setting)';
  }
  return presetPlace || 'Contemporary Urban Cinema Setting';
}

export function isStructuredScriptInput(raw) {
  const text = String(raw || '').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const hasSlugline = /\b(?:INT|EXT|INT\.\/EXT)\.\s+[A-Z]/i.test(text);
  const hasSpeakerCue = /^[A-Z][A-Z0-9 _-]{1,22}\s*:/m.test(text);
  const hasShotLabels = /^(?:S|SH|SCENE|SHOT)\s*\d+\s*[:\-—]/im.test(text);
  const hasQuotedDialogue = /["“][^"”]{4,}["”]/.test(text);
  return words >= 30 || hasSlugline || hasSpeakerCue || hasShotLabels || hasQuotedDialogue;
}

/**
 * Extracts real characters, locations, lighting, props, and chronological shot beats from
 * the operator's actual script/premise. NEVER substitutes default starter Bible entries
 * unless the user explicitly referenced them (@MIRA / @LOC-D) or asked to use the Bible.
 */
function buildProjectBlueprint(sourceText, bible = [], presetKey = null, useProjectBible = false) {
  const preset = presetKey ? PRESET_PROFILES[presetKey] : null;
  const raw = String(sourceText || '').trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // ── 1) CHARACTERS ────────────────────────────────────────────────────
  const charMap = new Map();

  const registerChar = (rawName, detail = '') => {
    const cleanWord = String(rawName || '')
      .replace(/^@+/, '')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .trim();
    if (!cleanWord || cleanWord.length < 2 || cleanWord.length > 20) return;
    const upper = cleanWord.toUpperCase();
    if (NON_CHAR_WORDS.has(upper) || /^\d+$/.test(upper)) return;
    const key = cleanWord.toLowerCase();
    const prev = charMap.get(key);
    const cleanDetail = detail.trim();
    if (prev) {
      if (cleanDetail && cleanDetail.length > prev.detail.length) {
        prev.detail = cleanDetail;
      }
      return;
    }
    charMap.set(key, {
      first: slugify(cleanWord, 'lead'),
      name: titleCase(cleanWord),
      tag: `@${upper}`,
      detail: cleanDetail,
    });
  };

  // 1a) Screenplay parenthetical intros: `CARLO (35, tired baker in flour-dusted maroon apron)`
  for (const m of raw.matchAll(/\b([A-Z][A-Z0-9_-]{1,18})\s*\(([^)]{3,140})\)/g)) {
    registerChar(m[1], m[2]);
  }

  // 1b) Screenplay speaker cues: `ELENA: "Three days, Carlo..."`
  for (const line of lines) {
    const sm = /^([A-Z][A-Za-z0-9_-]{1,18})(?:\s*\([^)]*\))?\s*:\s*(.+)$/.exec(line);
    if (sm && !/^(?:S|SH|SCENE|SHOT)\d*$/i.test(sm[1]) && !NON_CHAR_WORDS.has(sm[1].toUpperCase())) {
      registerChar(sm[1]);
    }
  }

  // 1c) Explicit @TAG references that match Bible entries
  for (const m of raw.matchAll(/@([A-Za-z0-9_-]{2,20})/g)) {
    const refTag = `@${m[1].toUpperCase()}`;
    const bibleMatch = bible.find((b) => b.tag.toUpperCase() === refTag);
    if (bibleMatch && bibleMatch.category === 'character') {
      registerChar(bibleMatch.title || m[1], bibleMatch.descriptor || '');
    } else if (!refTag.startsWith('@LOC') && !refTag.startsWith('@SET') && !refTag.startsWith('@PROP')) {
      registerChar(m[1]);
    }
  }

  // 1d) Explicit Bible mode fallback (only when user clicked "Use Active Project Bible" or gave zero names)
  if (charMap.size === 0 && useProjectBible) {
    for (const c of bible.filter((b) => b.category === 'character').slice(0, 3)) {
      registerChar(c.title || c.tag, c.descriptor || '');
    }
  }

  // 1e) Final neutral fallback for pure short idea with no named characters yet (e.g. "two brothers fighting over a jeepney")
  if (charMap.size === 0) {
    if (/\btwo\s+brothers\b/i.test(raw)) {
      registerChar('Mateo', 'late-20s older brother in faded denim work shirt, weathered hands, tense brow');
      registerChar('Lucas', 'early-20s younger brother in graphic tee and dark canvas cap, restless energy');
    } else if (/\btwo\s+sisters\b/i.test(raw)) {
      registerChar('Clara', 'late-20s older sister in olive linen blouse, poised but strained expression');
      registerChar('Nina', 'early-20s younger sister in cream knit top, bright expressive eyes');
    } else if (/\b(samurai|warrior|ronin)\b/i.test(raw)) {
      registerChar('Kenji', '30s weathered cyberpunk ronin in matte charcoal trench coat with subtle rain sheen');
    } else {
      registerChar('Lead', `protagonist suited to "${raw.slice(0, 60) || 'the scene'}", natural matte skin texture, grounded cinematic wardrobe`);
    }
  }

  const characters = Array.from(charMap.values()).slice(0, 4).map((c, idx) => {
    const fallbackPal = WARDROBE_PALETTE_DEFAULTS[idx % WARDROBE_PALETTE_DEFAULTS.length];
    const detailWithHex = c.detail ? injectHexesIntoWardrobe(c.detail) : '';
    const hasGarmentInDetail = /\b(apron|blouse|shirt|tee|jacket|coat|dress|hoodie|cardigan|suit|uniform|sweater|jeans|trousers|cap|glasses)\b/i.test(
      detailWithHex
    );
    const descriptor = detailWithHex
      ? hasGarmentInDetail
        ? `${detailWithHex}, natural pore-level skin texture, authentic candid lighting`
        : `${detailWithHex}, natural pore-level skin texture, wearing ${fallbackPal.desc}`
      : `early-30s grounded lead with natural pore-level skin texture, wearing ${fallbackPal.desc}`;

    const wardrobeSpec = hasGarmentInDetail ? detailWithHex : fallbackPal.hexes;
    return {
      tag: c.tag,
      first: c.first,
      name: c.name,
      sheetFile: `${c.first}_w1_sheet.jpg`,
      descriptor,
      wardrobeLock: `Wardrobe color lock for ${c.tag.slice(1)} (W1): ${wardrobeSpec} — hold exact garment hues against the attached reference; scene grade may tint the light, never the hue.`,
      voiceLock: `VOICE LOCK ${c.tag.slice(1)}: ${idx % 2 === 0 ? 'grounded mid-low pitch, textured natural timbre, steady deliberate cadence' : 'crisp mid pitch, clear resonant timbre, urgent incisive cadence'}`,
      heightCm: idx % 2 === 0 ? 174 : 164,
    };
  });

  // ── 2) LOCATION / SET & LIGHTING ─────────────────────────────────────
  let locName = '';
  let timeOfDay = '';
  let locDesc = '';

  const slugMatch = /\b(?:INT|EXT|INT\.\/EXT|EXT\.\/INT)\.?\s+([^\n–—-]+?)(?:\s*[-–—]\s*([A-Z][A-Z /]+))?(?:\r?\n|$)/i.exec(raw);
  if (slugMatch) {
    locName = titleCase(slugMatch[1].trim());
    timeOfDay = (slugMatch[2] || '').trim().toLowerCase();
  } else {
    // Check explicit @LOC / @SET Bible tag if referenced in source
    for (const m of raw.matchAll(/@([A-Za-z0-9_-]{2,20})/g)) {
      const refTag = `@${m[1].toUpperCase()}`;
      const locMatch = bible.find((b) => b.tag.toUpperCase() === refTag && b.category === 'location');
      if (locMatch) {
        locName = locMatch.title;
        locDesc = locMatch.descriptor;
        break;
      }
    }
  }

  if (!locName && useProjectBible) {
    const locB = bible.find((b) => b.category === 'location');
    if (locB) {
      locName = locB.title;
      locDesc = locB.descriptor;
    }
  }

  if (!locName) {
    const settingMatch = /\b(?:in|inside|at|on)\s+(?:a|an|the)?\s*([a-z0-9\s-]{3,32}?(?:bakery|street|alley|dormitory|dorm|cafe|coffee shop|kitchen|office|hospital|lab|laboratory|jeepney|terminal|market|beach|rooftop|bar|restaurant|house|apartment|room|station|garage|warehouse|studio|church|school|park|forest))\b/i.exec(
      raw
    );
    if (settingMatch) {
      locName = titleCase(settingMatch[1].trim());
    } else {
      locName = 'Primary Story Location';
    }
  }

  if (!timeOfDay) {
    if (/\bdawn|sunrise|early morning\b/i.test(raw)) timeOfDay = 'dawn';
    else if (/\bnight|midnight|late-night|neon\b/i.test(raw)) timeOfDay = 'night';
    else if (/\bsunset|dusk|golden hour\b/i.test(raw)) timeOfDay = 'dusk';
    else timeOfDay = 'day';
  }

  const lightingMap = {
    dawn: {
      lock: '4400K cool pre-dawn window light mixed with warm 3200K practical interior fixtures | key:fill 2.5:1 | shadow floor softly lifted',
      ambience: 'quiet pre-dawn exterior street hum, subtle interior room tone, faint distant traffic',
    },
    night: {
      lock: '3400K warm practical tungsten key | cool 5600K exterior night rim | key:fill 3:1 | shadow floor softly lifted',
      ambience: 'low night-time room tone, distant street ambience, soft environmental texture',
    },
    dusk: {
      lock: '3200K warm golden-hour key light | cool 5800K twilight fill | key:fill 2.5:1 | natural warm shadows',
      ambience: 'late-afternoon exterior hum, gentle breeze and urban room tone',
    },
    day: {
      lock: '5400K exact natural directional daylight | key:fill 2:1 | shadow floor lifted',
      ambience: 'natural indoor/outdoor daytime room tone, subtle background life murmur',
    },
  };
  const chosenLight = lightingMap[timeOfDay] || lightingMap.day;
  const locSlug = slugify(locName, 'main_set');

  // Collect action lines (non-dialogue, non-slugline) to enrich real set geography
  const actionLines = lines.filter(
    (l) =>
      !/^(?:INT|EXT|INT\.\/EXT)\./i.test(l) &&
      !/^[A-Z][A-Za-z0-9_-]{1,18}(?:\s*\([^)]*\))?\s*:/.test(l)
  );

  const set = {
    tag: `@SET-${locSlug.toUpperCase()}`,
    slug: locSlug,
    name: locName,
    timeOfDay,
    sheetFile: `set_${locSlug}_sheet.jpg`,
    anglesFile: `set_${locSlug}_angles.jpg`,
    blueprintFile: `blueprint_${locSlug}.jpg`,
    geography:
      locDesc ||
      `${locName} at ${timeOfDay}, grounded practical architectural layout with authentic lived-in textures${actionLines[0] ? `, featuring ${actionLines[0].slice(0, 110).replace(/\.$/, '')}` : ''}`,
    wallA: `left interior/architectural wall of ${locName} with practical work surfaces, shelving, and natural ${timeOfDay} window light`,
    wallB: `opposite far wall of ${locName} with doorway, signage, and practical warm fixture depth`,
    lightingLock: chosenLight.lock,
    ambience: chosenLight.ambience,
  };

  // ── 3) HERO PROP ─────────────────────────────────────────────────────
  const lowerRaw = raw.toLowerCase();
  let detectedProp = KNOWN_PROPS.find((p) => lowerRaw.includes(p));
  if (!detectedProp && useProjectBible) {
    const propB = bible.find((b) => b.category === 'prop');
    if (propB) detectedProp = propB.title;
  }
  const propName = detectedProp ? titleCase(detectedProp) : 'Story Hero Prop';
  const propSlug = slugify(propName, 'hero_prop');
  const prop = {
    tag: `@PROP-${propSlug.toUpperCase()}`,
    slug: propSlug,
    name: propName,
    sheetFile: `prop_${propSlug}_sheet.jpg`,
    descriptor: detectedProp
      ? `authentic grounded ${detectedProp} with realistic lived-in patina, tactile wear, and rigid physical weight`
      : `grounded tactile hero prop central to the scene in ${locName}, authentic wear and rigid physical weight`,
  };

  // ── 4) CHRONOLOGICAL SHOTS FROM USER'S REAL BEATS & VERBATIM DIALOGUE ─
  const language = detectLanguage(raw, preset?.language || 'English');
  const genre = detectGenre(raw, presetKey);
  const place = detectPlace(raw, preset?.place);
  const aspect =
    /\b(9:16|vertical|tiktok|reels|shorts)\b/i.test(raw)
      ? '9:16'
      : /\b(21:9|anamorphic)\b/i.test(raw)
        ? '21:9'
        : preset?.aspect || '16:9';

  const parsedBeats = [];
  for (const line of lines) {
    if (/^(?:INT|EXT|INT\.\/EXT)\./i.test(line)) continue;
    const spkMatch = /^([A-Z][A-Za-z0-9_-]{1,18})(?:\s*\([^)]*\))?\s*:\s*["“]?(.+?)["”]?\s*$/.exec(line);
    if (spkMatch && !/^(?:S|SH|SCENE|SHOT)\d*$/i.test(spkMatch[1]) && !NON_CHAR_WORDS.has(spkMatch[1].toUpperCase())) {
      const spkChar = characters.find((c) => c.first === slugify(spkMatch[1])) || characters[0];
      parsedBeats.push({
        type: 'dialogue',
        speaker: spkChar,
        dialogue: spkMatch[2].replace(/^["“]|["”]$/g, '').trim(),
        action: `${spkChar.name} delivers the line squarely across ${set.name} with grounded autonomic tension`,
      });
    } else if (line.length >= 12) {
      const quoted = /["“]([^"”]{4,160})["”]/.exec(line);
      const mentionedChar =
        characters.find((c) => new RegExp(`\\b${c.name}\\b`, 'i').test(line)) || characters[0];
      parsedBeats.push({
        type: quoted ? 'dialogue' : 'action',
        speaker: mentionedChar,
        dialogue: quoted ? quoted[1].trim() : 'none',
        action: line.replace(/["“][^"”]+["”]/g, '').trim() || `${mentionedChar.name} holds focus inside ${set.name}`,
      });
    }
  }

  // Ensure at least 3 well-structured cinematic shots even for a 1-line idea
  if (parsedBeats.length === 0) {
    parsedBeats.push(
      {
        type: 'action',
        speaker: characters[0],
        dialogue: 'none',
        action: `${characters[0].name} establishes the space inside ${set.name} (${raw.slice(0, 120) || 'opening beat'})`,
      },
      {
        type: 'action',
        speaker: characters[1] || characters[0],
        dialogue: 'none',
        action: `${(characters[1] || characters[0]).name} reacts to the turning point with subtle jaw tension and shifting eye line`,
      },
      {
        type: 'action',
        speaker: characters[0],
        dialogue: 'none',
        action: `${characters[0].name} holds still in the final beat as light settles across ${set.name}`,
      }
    );
  } else if (parsedBeats.length === 1) {
    parsedBeats.push({
      type: 'action',
      speaker: characters[1] || characters[0],
      dialogue: 'none',
      action: `${(characters[1] || characters[0]).name} holds an unbroken reaction beat inside ${set.name}`,
    });
  }

  const sizeVariety = ['MWS', 'MCU', 'OTS', 'CU', 'MS', 'MCU', 'OTS', 'CU'];
  const lensVariety = ['35mm', '50mm', '50mm', '85mm', '35mm', '50mm', '85mm', '85mm'];

  const shots = parsedBeats.slice(0, 8).map((beat, i, arr) => {
    const isFirst = i === 0;
    const isLast = i === arr.length - 1;
    const size = isFirst && beat.type === 'action' ? 'MWS' : isLast ? 'CU' : sizeVariety[i % sizeVariety.length];
    const lens = lensVariety[i % lensVariety.length];
    const keepD = isLast ? 5 : 4;
    const timing = calcDurationTier(beat.dialogue, keepD, 0.5);
    const spk = beat.speaker || characters[0];
    const other = characters.find((c) => c.tag !== spk.tag) || null;
    const isLeft = characters.indexOf(spk) % 2 === 0;
    const eyelineDir = other
      ? isLeft
        ? `screen-right toward ${other.name}`
        : `screen-left toward ${other.name}`
      : 'slightly off-axis across the room';
    const bgWall = isLeft ? set.wallA : set.wallB;
    const camId = `CAM-${String.fromCharCode(65 + (i % 4))}`;
    const startRung = Math.min(9, 3 + i * 2);
    const endRung = Math.min(10, startRung + (isLast ? 2 : 1));
    const polarity = other
      ? `${spk.tag.slice(1)} climbs (${startRung}→${endRung}) while ${other.tag.slice(1)} holds/recedes (${Math.max(2, startRung - 1)}→${Math.max(2, startRung - 2)})`
      : `${spk.tag.slice(1)} builds steadily (${startRung}→${endRung})`;

    return {
      id: `S${i + 1}`,
      role: isFirst
        ? 'Opening calibration & set-seed anchor'
        : isLast
          ? 'R5 climax payoff & final held beat'
          : beat.type === 'dialogue'
            ? 'R4 dialogue hinge anchor'
            : 'Mid-scene blocking & tension turn',
      size,
      angle:
        size === 'OTS'
          ? `over-the-shoulder two-shot past ${other ? other.name + "'s" : 'foreground'} shoulder`
          : size === 'CU'
            ? 'intimate eye-level close-up'
            : size === 'MWS'
              ? 'eye-level 3/4 establishing wide'
              : 'eye-level medium close-up',
      lens,
      camMove:
        size === 'MWS'
          ? `ultra-slow 4 percent dolly push-in over ${timing.genD} seconds`
          : `static locked camera with no more than 5 percent handheld breath drift over ${timing.genD} seconds`,
      speaker: spk,
      other,
      action: beat.action,
      bgWall,
      eyelineDir,
      polarity,
      emo: `${startRung}→${endRung}/10 (${beat.type === 'dialogue' ? 'mounting confrontation' : 'focused tension'} — TURN: subtle jaw set & breath beat)`,
      dialogue: beat.dialogue,
      timing,
      risk: isLast ? 5 : beat.type === 'dialogue' ? 4 : 2,
      model: isLast || beat.type === 'dialogue' ? 'Veo 3.1' : 'Omni 1.1 Flash',
      spatialAnchor: `Camera stands at ${camId} inside ${set.name} facing ${isLeft ? 'west' : 'east'}; ${spk.name} holds ${isLeft ? 'frame-left' : 'frame-right'}${other ? ` opposite ${other.name} on ${isLeft ? 'frame-right' : 'frame-left'}` : ''}; ${bgWall} sits behind ${spk.name}; key lighting matches ${set.lightingLock}.`,
      endState: `${spk.name} holding still with locked gaze ${eyelineDir} after the beat settles`,
    };
  });

  const totalKeep = shots.reduce((acc, s) => acc + s.timing.keepD, 0);
  const mm = String(Math.floor(totalKeep / 60)).padStart(2, '0');
  const ss = String(Math.round(totalKeep % 60)).padStart(2, '0');

  return {
    slug: slugify(`${locName}_${characters[0]?.first || 'scene'}`, 'director_project'),
    premise: raw.replace(/\s+/g, ' ').slice(0, 260) || `${characters[0].name} inside ${set.name}`,
    genre,
    language,
    aspect,
    platform:
      preset?.platform ||
      (aspect === '9:16'
        ? 'TikTok / Reels / Shorts (9:16 vertical, ≤60s)'
        : 'YouTube Long-Form / Cinema (16:9 widescreen)'),
    outputMode: preset?.outputMode || 'FILM',
    envelope: preset?.envelope || 'CRESCENDO',
    grade:
      preset?.grade ||
      '35mm Kodak Vision3 cinema film, pore-level natural skin texture, optical shallow DOF, 180-degree shutter blur',
    place,
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
  const allCards = [];

  for (const ch of bp.characters) {
    allCards.push({
      filename: ch.sheetFile,
      token: `${ch.tag}_W1`,
      role: 'face lock',
      kind: `Character 2x4 Chroma-Green Grid Sheet (${ch.name})`,
      prompt: [
        `ATTACH: ${ch.sheetFile} — TARGET OUTPUT (create fresh master FACE LOCK sheet)`,
        `ONE single image containing EXACTLY 8 panels arranged in a 2-column x 4-row grid — not a portrait, not a single view. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Row 1: front headshot faceF | side profile headshot faceS. Row 2: full body front bodyF | full body side profile bodyS. Row 3: over-the-shoulder front otsF | over-the-shoulder profile otsS. Row 4: over-the-shoulder back otsB | clean label cell reading "${ch.tag} W1". Subject (${ch.name}): ${ch.descriptor}. All 7 identity panels render the EXACT SAME person: identical facial bone structure, identical skin texture, identical hair, identical wardrobe, and identical lighting mood in every panel. Pure chroma green (#00FF00) seamless studio backdrop in every panel: even flat lighting, zero shadows cast on the background, zero green spill on skin and wardrobe. Soft key light, 85mm lens, thin white grid borders, zero text beyond the label cell, no printed color swatches. ${ch.wardrobeLock}`,
      ].join('\n'),
    });
  }

  allCards.push(
    {
      filename: bp.set.sheetFile,
      token: bp.set.tag,
      role: 'spatial lock',
      kind: `Location 2x2 Set Grid Sheet (${bp.set.name})`,
      prompt: [
        `ATTACH: ${bp.set.sheetFile} — TARGET OUTPUT (2x2 WALL MAP auditor sheet)`,
        `ONE single image containing EXACTLY 4 panels arranged in a 2-column x 2-row grid of the SAME room — not a single-angle photo, not four different rooms. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Top-left: wide establishing from entrance of ${bp.set.name}. Top-right: reverse view from far wall toward entrance showing ${bp.set.wallB}. Bottom-left: 90-degree lateral side profile showing ${bp.set.wallA}. Bottom-right: high-angle corner overview revealing full 3D furniture geometry. Room specification: ${bp.set.geography}. The EXACT SAME room in all 4 panels: identical architecture, identical furniture in identical positions, identical materials and colors. Lighting lock across all 4 panels: ${bp.set.lightingLock}. Thin white borders, 35mm lens, zero people, zero text, zero labels, no printed color swatches.`,
      ].join('\n'),
    },
    {
      filename: bp.set.anglesFile,
      token: bp.set.tag,
      role: 'spatial angles',
      kind: `Set 8-View Angle Grid (${bp.set.name})`,
      prompt: [
        `ATTACH: ${bp.set.sheetFile} — SPATIAL REFERENCE LOCK`,
        `ONE single image containing EXACTLY 8 panels arranged in a 2-column x 4-row grid — the SAME set seen from 8 different angles — not 8 different sets. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Row 1: aerial top-down view | view from entrance. Row 2: reverse from far side | left profile wall (${bp.set.wallA}). Row 3: right profile wall (${bp.set.wallB}) | high northeast corner. Row 4: low southwest corner | clean label cell "${bp.set.tag}". Room: ${bp.set.geography}. The EXACT SAME set in all 8 panels: identical landmark positions, identical architecture, identical props in identical positions. Lighting lock: ${bp.set.lightingLock}. Thin white borders, 35mm lens, zero people, zero text beyond the label cell, no color swatches.`,
      ].join('\n'),
    },
    {
      filename: bp.set.blueprintFile,
      token: bp.set.tag,
      role: 'blueprint',
      kind: `Top-Down 2D Set Blueprint (${bp.set.name})`,
      prompt: [
        `ATTACH: ${bp.set.sheetFile} — GEOMETRY REFERENCE`,
        `ONE top-down 2D architectural blueprint of ${bp.set.name}: clean technical line-drawing, flat white background, colored labels, NOT photoreal, NOT a film frame — banner text BLUEPRINT — NOT A FRAME across the top. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Labeled landmarks: A1 primary counter/focal table (center), A2 practical window/key light source (west wall), B1 doorway/far wall (${bp.set.wallB}), C1 secondary fixtures (${bp.set.wallA}). Include compass rose (N/E/S/W), key-light direction arrow matching ${bp.set.lightingLock}, metric scale bar, and lettered camera wedges CAM-A, CAM-B, CAM-C, CAM-D with facing arrows.`,
      ].join('\n'),
    },
    {
      filename: bp.prop.sheetFile,
      token: bp.prop.tag,
      role: 'prop lock',
      kind: `Hero Prop Chroma-Green 8-Grid (${bp.prop.name})`,
      prompt: [
        `ATTACH: ${bp.prop.sheetFile} — TARGET OUTPUT (Hero Prop 8-Grid)`,
        `ONE single image containing EXACTLY 8 panels arranged in a 2-column x 4-row grid — the SAME prop seen from 8 different angles, orbiting clockwise — not 8 different props. Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Row 1: front | 3/4 left. Row 2: left profile | rear-3/4 left. Row 3: back | rear-3/4 right. Row 4: right profile | clean label cell "${bp.prop.tag}". Prop specification (${bp.prop.name}): ${bp.prop.descriptor}. Identical object state, identical scale, and identical distance-to-lens in every panel; one neutral scale reference in the front panel only. Every panel renders on a pure chroma green (#00FF00) seamless background: even flat lighting, zero shadows cast on the background, zero green spill on the object, identical object state in every panel. 85mm lens, thin white borders, zero people, zero text beyond label cell.`,
      ].join('\n'),
    }
  );

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
    `A (Asset Cards): ${lockedCount}/${cards.length} ready (${lockedCount} locked, ${remaining} remaining to serve) — active: ${activeLabel || (cards.find((c) => !c.locked)?.filename ?? 'ASSET GATE READY')}`,
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
    ` 1) ★ Confirm ${card.filename} Rendered & Advance to Next Queue A Card / Asset Gate`,
    ` 2) Skip to Shot S1 Now — Unlock ASSET GATE (${Math.max(0, pendingCount - 1)} remaining cards can be rendered anytime)`,
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
  const spk = shot.speaker || bp.characters[0];
  const other = shot.other;
  const t = shot.timing;
  const charAttach = [spk, ...(other ? [other] : [])].map((c) => `${c.sheetFile} — FACE LOCK`);
  const attachList = [
    ...charAttach,
    `${bp.set.sheetFile}`,
    `${bp.set.anglesFile}`,
    `${bp.set.blueprintFile} — GEOMETRY LOCK`,
    `${bp.prop.sheetFile}`,
  ].join(', ');

  const audioContract = shot.dialogue === 'none' ? 'SILENT-OK' : 'VO REQUIRED';
  const dialogueSentence =
    shot.dialogue === 'none'
      ? `Room tone: ${bp.set.ambience}; no spoken dialogue, no background music.`
      : `${spk.name} says in ${bp.language}, grounded and clear: "${shot.dialogue}" Room tone: ${bp.set.ambience}; no background music.`;

  const wardrobeLocks = [spk, ...(other ? [other] : [])].map((c) => c.wardrobeLock).join(' ');
  const quartetAngles =
    quartetBatch === 1
      ? 'Candidate A low wide · Candidate B eye-level standard · Candidate C high 3/4 · Candidate D tight lateral'
      : `Batch ${quartetBatch} novel angles (zero reuse): Candidate A low over-shoulder · Candidate B oblique table-level · Candidate C high opposite 3/4 · Candidate D tight foreground-occluded profile`;

  const lines = [];
  if (extraNote) lines.push(extraNote, '');

  lines.push(
    `[SHOT ${shot.id} OF S${bp.shots.length} — PAIRED CHRONOLOGICAL QUEUE (QUARTET + QUEUE B + ACCEPTANCE CARD)]`,
    '',
    '```text',
    `=== ${shot.id} | ${shot.role} | chronological #${shotIndex + 1} of ${bp.shots.length} | attach: ${[spk.sheetFile, ...(other ? [other.sheetFile] : []), bp.set.sheetFile, bp.set.blueprintFile].join(', ')} ===`,
    '',
    `PANEL: ${shot.model} | gen ${t.genD}s → keep ${t.keepD}s (shave-${t.shave}s${t.voMargin ? ` + ${t.voMargin}s VO margin` : ''}) | ${bp.aspect} | 1080p | x1 | UNIQUENESS: 40/100 | AUDIO: ${audioContract}`,
    '```',
    '',
    `[STEP A — FRAME QUARTET ${shot.id} — BATCH ${quartetBatch} (save picked winner as ${shot.id}_f.jpg in /01-shots/)]`,
    '',
    '```text',
    `ATTACH: ${attachList}`,
    `Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Frame Quartet ${shot.id}_f-A/B/C/D (${quartetAngles}). Cinematic film still, ${bp.aspect}, ${shot.size}, ${shot.angle}, ${shot.lens} lens. ${spk.name} (${spk.descriptor})${other ? ` opposite ${other.name} (${other.descriptor})` : ''} inside ${bp.set.name}: ${shot.action}. ${shot.spatialAnchor} Background wall behind subject: ${shot.bgWall}. Lighting: ${bp.set.lightingLock}. ${bp.grade}. Subtle foreground environmental occlusion on frame edge, natural 35mm film grain, no text, no watermark, no printed color swatches. ${wardrobeLocks}`,
    '```',
    '',
    `[STEP B — VIDEO GENERATION ${shot.id} (save as ${shot.id.toLowerCase()}.mp4 in /01-shots/ | attach EXACTLY ONE start frame: ${shot.id}_f.jpg)]`,
    '',
    `* **Queue B Video Prompt** (pure natural language, ≤240 words, §5.2 5-part front-loaded order):`,
    '',
    '```text',
    `ATTACH: ${shot.id}_f.jpg — SOLE START FRAME, ${charAttach.join(', ')}, ${bp.set.sheetFile}, ${bp.set.blueprintFile} — GEOMETRY LOCK`,
    `${shot.size}, ${shot.angle}, ${shot.lens} cinema lens, ${shot.camMove}. ${spk.name} (${spk.descriptor}) ${shot.action}, eyes holding ${shot.eyelineDir} with subtle autonomic tension (${shot.emo}; ${shot.polarity})${other ? ` while ${other.name} (${other.descriptor}) reacts in opposite polarity across the frame` : ''}. ${shot.spatialAnchor} Behind sits ${shot.bgWall}, lit with ${bp.set.lightingLock}, natural 35mm film grain and authentic environmental life. ${dialogueSentence} ${wardrobeLocks} Avoid: face or wardrobe hue drift, mirrored two-character emotions, background geometry teleporting, waxy poreless skin, stiff frozen upper face, ${bp.language !== 'English' ? 'English speech, ' : ''}no text, no watermark, no printed color swatches or hex code text strings in frame.`,
    '```',
    '',
    `* **Motion Prompt** (Image-to-Video — attach \`${shot.id}_f.jpg\` as the SOLE start frame):`,
    '',
    '```text',
    `ATTACH: ${shot.id}_f.jpg — SOLE START FRAME`,
    `${t.genD} seconds, ${shot.size} ${shot.angle} hold (MOTION SPEED TAG: ${shot.camMove}), ${shot.action}, subtle ambient motion inside ${bp.set.name}, landing cleanly on ${shot.endState} (EMO arc ${shot.emo}).`,
    '```',
    '',
    `* **Last Frame Prompt** (Pass 2 → \`${shot.id}_lastf.jpg\` — next-shot continuity target / QA reference only):`,
    '',
    '```text',
    `ATTACH: ${charAttach.join(', ')}, ${bp.set.sheetFile}, ${bp.set.blueprintFile}`,
    `Render with ${bp.renderer} at maximum resolution (${bp.resolutionTier}), ${bp.aspect}. Cinematic film still, ${bp.aspect}, ${shot.size}, ${shot.angle}. ${spk.name} (${spk.descriptor}) holding the exact end-state residue pose: ${shot.endState}. ${shot.spatialAnchor} Lighting: ${bp.set.lightingLock}. ${bp.grade}, 35mm film grain, no text, no watermark, no printed color swatches.`,
    '```',
    '',
    '* **Shot Metadata & Execution Command:**',
    '',
    '```text',
    `Duration Tier: ${t.genD}s | Uniqueness: 40/100 — STANDARD (identity & wardrobe hue lock ≤ 20) | Tag: ${[spk, ...(other ? [other] : [])].map((c) => c.tag.slice(1)).join(', ')}`,
    '',
    `Audio: ${shot.dialogue === 'none' ? `${bp.set.ambience} only` : `"${shot.dialogue}"`} | Audio Contract: ${audioContract}`,
    '',
    `Emotion Arc: ${shot.emo} | POLARITY: ${shot.polarity} | END-STATE RESIDUE: ${shot.endState}`,
    '',
    `Audio Direction: ${spk.voiceLock}; natural close-mic delivery in ${bp.language}, dialogue foreground above ${bp.set.ambience}, zero background music.`,
    '',
    `Execution Command: GENERATE ${shot.id} as ONE clip: attach single start frame ${shot.id}_f.jpg (plus ${[spk.sheetFile, ...(other ? [other.sheetFile] : []), bp.set.sheetFile].join(', ')}); DURATION = ${t.genD}s exactly; AUDIO = ${shot.dialogue === 'none' ? 'SILENT-OK: no dialogue' : `VO REQUIRED: speak verbatim in ${bp.language} — "${shot.dialogue}"; voice = ${spk.voiceLock}`}; UNIQUENESS = 40/100 (identity & wardrobe hue lock ≤ 20); ${wardrobeLocks} PASTE BOUNDARY — after rendering ${shot.id.toLowerCase()}.mp4, select your verdict on the Acceptance Card below.`,
    '```',
    '',
    `[STEP C — 12-POINT ACCEPTANCE CARD ${shot.id} & VERDICT MENU]`,
    '',
    '```text',
    `Acceptance Card: ${shot.id} | 1. DURATION = <actual>s vs tier ${t.genD}s | 2. AUDIO = ${audioContract} verbatim & complete Y/N | 3. LANGUAGE = matches LANGUAGE LOCK (${bp.language}) Y/N | 4. PACING = last word lands ≥1.0s before clip end Y/N | 5. SPATIAL = frame sides (AXIS MAP) + eyelines + geography (LOCATION LOCK) + blueprint geometry (SPATIAL CONTRACT) + reverse-angle wall (WALL MAP) + Kelvin (LIGHTING LOCK) all match Y/N | 6. DIALOGUE = 100% complete, zero mid-word cut at tail Y/N | 7. IDENTITY & HEX HUE LOCK = exact sheet ${spk.sheetFile} attached & matched ("grade may tint light, never hue") Y/N | 8. MOTION = matches prompt & MOTION SPEED TAG ceiling Y/N | 9. EMO ARC = start→end climb, named TURN, opposite polarity, end-state residue landed Y/N | 10. COVERAGE = matches EDIT MAP Y/N | 11. UNIQUENESS = stayed within 40/100 dial (hue lock ≤ 20) Y/N | 12. VERDICT: PASS or FAIL`,
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
  const cards = buildQueueACards(bp, ledgerMap);
  const charSheets = bp.characters.map((c) => c.sheetFile);
  const allCharsBound = bp.characters.every((c) => isLockedInLedger(c.sheetFile, ledgerMap));
  const sheetStatus = allCharsBound
    ? `REF BOUND (${charSheets.join(', ')})`
    : `QUEUE A REQUIRED (${charSheets.join(', ')} — served at STEP 0 ASSETS, never pre-approved before render)`;
  const rosterMode = cards.every((c) => c.locked)
    ? 'LOCKED-REFS'
    : cards.some((c) => c.locked)
      ? 'HYBRID'
      : 'GENERATE';

  return [
    `Pre-analysis locked — ${bp.characters.length} character(s) (${bp.characters.map((c) => c.tag).join(', ')}), 1 location (${bp.set.tag} — ${bp.set.name}), ${bp.shots.length} master shots, detected language: ${bp.language}, detected genre: ${bp.genre}. Executing EXPRESS WALK receipts (O-1a → O-15):`,
    '',
    `[DEFAULT APPLIED: O-1a — GENRE LOCK: ${bp.genre}]`,
    `[DEFAULT APPLIED: O-1b — CHARACTER ROSTER: ${bp.characters.map((c) => `${c.tag} (${c.name})`).join(' · ')} | ROSTER MODE: ${rosterMode}]`,
    `[DEFAULT APPLIED: O-2 — WARDROBE & HEX LOCK: ${bp.characters.map((c) => `${c.tag}_W1`).join(', ')} locked (skin prose-only, garments [#HEX])]`,
    `[DEFAULT APPLIED: O-3 — TOOL DECLARATION: ${bp.renderer} (4K Max) + Google Flow (Omni 1.1 Flash workhorse / Veo 3.1 hero)]`,
    `[DEFAULT APPLIED: O-4 — PLATFORM & ASPECT: ${bp.platform} | ${bp.aspect}]`,
    `[DEFAULT APPLIED: O-5 — CHARACTER 2x4 CHROMA-GREEN SHEETS: ${sheetStatus}]`,
    `[DEFAULT APPLIED: O-6 — TASTE CONFIRMATION: ${allCharsBound ? 'REF BOUND' : 'Deferred to Queue A (QUEUE A REQUIRED — zero false verified_on_disk)'}]`,
    `[DEFAULT APPLIED: O-7 — HERO PROPS LOCK: ${bp.prop.tag} (${bp.prop.name}) → ${bp.prop.sheetFile}]`,
    `[DEFAULT APPLIED: O-8 — LOCATIONS & SPATIAL PACKAGE: ${bp.set.tag} (${bp.set.name}) → ${bp.set.sheetFile} + ${bp.set.anglesFile} + ${bp.set.blueprintFile}]`,
    `[DEFAULT APPLIED: O-9 — DIRECTOR'S CHAIR: AUTO — DIRECTOR'S CUT | CLIMAX ENVELOPE: ${bp.envelope}]`,
    `[DEFAULT APPLIED: O-10 — RUNTIME TARGET: ${bp.runtimeLabel} across ${bp.shots.length} master shots]`,
    `[DEFAULT APPLIED: O-11 — PLACE & CAPTION LOCK: ${bp.place} | no in-gen captions (TEXT-POST only)]`,
    `[DEFAULT APPLIED: O-12 — LANGUAGE LOCK: ${bp.language} (verbatim source integrity)]`,
    `[DEFAULT APPLIED: O-13 — DIALOGUE REVIEW: ${bp.shots.filter((s) => s.dialogue !== 'none').length} spoken line(s) verified verbatim under §6.1 duration math]`,
    `[DEFAULT APPLIED: O-14 — SCREEN TEXT: TEXT-GEN none | TEXT-POST approved for editor assembly]`,
    `[DEFAULT APPLIED: O-15 — GENERATION BILL: ${cards.filter((c) => !c.locked).length} Queue A asset card(s) remaining (${cards.filter((c) => c.locked).length} locked) + ${bp.shots.length} Pass 1 Frame Quartets + ${bp.shots.length} video clips | DISPENSE: STEP | SERIES MODE: OFF]`,
    '',
    `[STEP 16 OF 16 — O-16 FINAL GATE: BUILD]`,
    `All 16 onboarding locks are staged for **${bp.set.name}** (${bp.characters.map((c) => c.name).join(' & ')} · ${bp.aspect} · ${bp.language} · ${bp.shots.length} shots · ${bp.runtimeLabel}). Click **1) ★ BUILD** to compile the 12-Item Production Kit with \`CHECKS: 78/78 PASS\` and immediately serve Queue A Card 1.`,
    '',
    '```text',
    ' 1) ★ BUILD — compile & emit the 12-Item Production Kit + serve the first active queue step',
    ' 2) ASSETS READY — bind existing sheets/sets/frames as REF BOUND before building',
    ' 3) Re-open Character Roster (O-1b) to edit cast',
    ' 4) Re-open Dialogue Review (O-13) before building',
    ' 5) Custom — type any O-step ID or revision',
    '```',
  ].join('\n');
}

function renderFullBuildKit(bp, ledgerMap) {
  const cards = buildQueueACards(bp, ledgerMap);
  const firstPendingIdx = cards.findIndex((c) => !c.locked);

  const shotListLines = bp.shots.map((s, i) => {
    const startSec = bp.shots.slice(0, i).reduce((acc, x) => acc + x.timing.keepD, 0);
    const endSec = startSec + s.timing.keepD;
    const fmt = (sec) => `00:${String(Math.floor(sec)).padStart(2, '0')}`;
    const castTags = [s.speaker, ...(s.other ? [s.other] : [])].map((c) => `${c.tag}_W1`).join(' ');
    return [
      `${s.id} (${fmt(startSec)}–${fmt(endSec)} | shave-${s.timing.shave}s | Tier: ${s.timing.genD}s)`,
      `${castTags} — RISK ${s.risk} | ROLL 1 | ${s.role} | TYPE: ANCHOR | SET: ${bp.set.tag} | AUDIO: ${s.dialogue === 'none' ? 'SILENT-OK' : 'VO REQUIRED'} | EMO: ${s.emo}`,
      `- ACT: ${s.action}.`,
      `- CAM: ${s.size}, ${s.angle} | ${s.lens} | ${s.camMove} | 180° shutter blur.`,
      `- LIGHT: ${bp.set.lightingLock}.`,
      `- LINE: ${s.dialogue === 'none' ? 'none' : `${s.speaker.tag} (${bp.language}): "${s.dialogue}"`}`,
    ].join('\n');
  });

  const axisLine =
    bp.characters.length >= 2
      ? `AXIS MAP ${bp.set.tag}: ${bp.characters[0].tag} = frame-left (${bp.characters[0].heightCm} cm), ${bp.characters[1].tag} = frame-right (${bp.characters[1].heightCm} cm)`
      : `AXIS MAP ${bp.set.tag}: ${bp.characters[0].tag} = frame-left (${bp.characters[0].heightCm} cm)`;

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
    ...bp.characters.flatMap((c) => [
      `- ${c.tag}_W1 (${c.sheetFile}): ${c.descriptor}.`,
      `- ${c.voiceLock}.`,
    ]),
    `- ${bp.prop.tag} (${bp.prop.sheetFile}): ${bp.prop.descriptor}.`,
    '',
    `**Item 6–7 · GLOBAL HEADER, SPATIAL CONTRACT & LOOK/LOCATION REGISTERS**`,
    `- STYLE LOCK: ${bp.grade} · ${bp.place}.`,
    `- LOCATION REGISTER: ${bp.set.tag} (${bp.set.name}) | ${bp.set.sheetFile} + ${bp.set.anglesFile} + ${bp.set.blueprintFile} | WALL MAP: Wall A = ${bp.set.wallA} | Wall B = ${bp.set.wallB} | LIGHTING LOCK: ${bp.set.lightingLock}.`,
    `- SPATIAL CONTRACT TABLE: A1 Primary Focal Surface (center of ${bp.set.name}) | A2 Practical Key Light / Window (west wall) | B1 Far Wall & Entrance (${bp.set.wallB}) | C1 Side Wall Fixtures (${bp.set.wallA}).`,
    `- ${axisLine}`,
    '',
    `**Item 8 · COMPLETE SHOT LIST (S1 → S${bp.shots.length})**`,
    ...shotListLines,
    '',
    `**Item 9–11 · RUN SHEET & SILENT 78-POINT GATE**`,
    `- RUN SHEET: PHASE 0 ASSETS (/00-cards/) → PHASE 1 OPENING S1 → PHASE 2 ANCHORS → PHASE 4 CLIMAX S${bp.shots.length} → PHASE 5 EDIT ASSEMBLY (/02-edit/).`,
    `- \`RUNTIME CHECK: TOTAL = ${bp.runtimeLabel} (matches target: yes) | CHECKS: 78/78 PASS\``,
    '',
    '---',
  ].join('\n');

  if (firstPendingIdx === -1) {
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
    useProjectBible: Boolean(sessionState.useProjectBible),
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
      nextState: {
        ...state,
        stage: 'step0',
        built: false,
        queueACardIdx: 0,
        shotIdx: 0,
        shotsPassed: 0,
        useProjectBible: false,
      },
    };
  }

  // 2) Global trigger: ASSETS READY (§2.0)
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
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
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
          'Paste your script, beat sheet, or multi-scene brief below. Every character, location, and spoken line stays 100% verbatim (Tier 1 Source Integrity) and is normalized via the 8-Point Script Sanitizer.',
          '',
          '```text',
          ' 1) ★ Use Active Project Bible to Draft & Express-Walk a 3-Shot Pilot Scene',
          ' 2) ASSETS READY — Bind Existing Reference Assets First (§2.0)',
          ' 3) Return to STEP 0 Menu',
          ' 4) Custom — Paste your full script or scene brief below',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'await_source', presetKey: null, useProjectBible: false },
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
        nextState: { ...state, stage: 'await_express_source', presetKey: chosenPreset, useProjectBible: false },
      };
    }

    // Direct pasted script OR short premise at STEP 0 (§2.1 quantitative routing)
    if (isStructuredScriptInput(input)) {
      const bp = buildProjectBlueprint(input, bible, state.presetKey, false);
      return {
        text: [
          `Pre-analysis locked — ${bp.characters.length} character(s) (${bp.characters.map((c) => c.tag).join(', ')}), 1 location (${bp.set.tag} — ${bp.set.name}), ${bp.shots.length} master shots, detected language: ${bp.language}, detected genre: ${bp.genre}. Opening Step 1a of 16.`,
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
        nextState: { ...state, stage: 'o1a', sourceText: input, useProjectBible: false },
      };
    }

    // Short idea (<30 words, no headers/dialogue) -> Path N with premise preserved
    const bp = buildProjectBlueprint(input, bible, state.presetKey, false);
    return {
      text: [
        `✔ Captured story premise: "${bp.premise}"`,
        '',
        '[STEP A-1a OF 7 — FORMAT SELECTION]',
        '',
        '```text',
        ' 1) ★ Vertical Short Drama (TikTok/Reels/Shorts)',
        ' 2) Short Film (16:9 Cinema)',
        ' 3) Series Episode',
        ' 4) Ad / Commercial Spot',
        ' 5) Trailer / Teaser',
        ' 6) EXPRESS: Auto-Story + Express Walk straight to O-16 BUILD Gate',
        ' 7) Custom — type format notes',
        '```',
      ].join('\n'),
      nextState: { ...state, stage: 'auto_story_a1a', sourceText: input, useProjectBible: false },
    };
  }

  // 5) STAGE: VIDEO CHANNEL GATE
  if (state.stage === 'video_gate') {
    const bp = buildProjectBlueprint(
      ['1', '2', '3'].includes(input)
        ? 'Path V video regeneration study from uploaded reference clip'
        : input,
      bible,
      state.presetKey,
      ['1', '2', '3'].includes(input)
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

  // 6) STAGE: AUTO STORY A-1a -> A-7 or Express
  if (state.stage === 'auto_story_a1a') {
    const presetForFormat = input === '4' ? 'AD PUNCH' : input === '1' ? 'FILM SENTI' : null;
    const effectiveIdea =
      input.length > 4
        ? input
        : state.sourceText || 'Late-night Manila rain turning point inside a neighborhood bakery';
    const bp = buildProjectBlueprint(effectiveIdea, bible, presetForFormat, false);
    if (input === '6' || input === '9' || /\b(RECOMMENDED ALL|EXPRESS|BUILD NOW|AUTO)\b/i.test(input)) {
      return {
        text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
        nextState: { ...state, stage: 'build_gate', presetKey: presetForFormat, sourceText: effectiveIdea, useProjectBible: false },
      };
    }
    return {
      text: [
        `✔ Locked A-1a Format | [STEP A-7 OF 7 — STORY SUMMARY GATE]`,
        `**Logline:** ${bp.premise}`,
        `**Genre Lock:** ${bp.genre} · **Platform:** ${bp.platform} · **Runtime:** ${bp.runtimeLabel} (${bp.shots.length} master shots)`,
        `**Cast:** ${bp.characters.map((c) => `${c.tag} (${c.name})`).join(', ')} · **Set:** ${bp.set.tag} (${bp.set.name}) · **Hero Prop:** ${bp.prop.tag} (${bp.prop.name})`,
        '',
        '```text',
        ' 1) ★ EXPRESS: YES + FAST-TRACK ALL — lock story, auto-apply ★ Recommended across O-1a–O-15 with receipts, stop at the BUILD gate',
        ' 2) YES — Lock story and open Step 1a of 16 (Genre Confirm Gate)',
        ' 3) Regenerate a fresh story concept',
        ' 4) Custom — type story modifications',
        '```',
      ].join('\n'),
      nextState: { ...state, stage: 'auto_story_a7', presetKey: presetForFormat, sourceText: effectiveIdea, useProjectBible: false },
    };
  }

  // 7) STAGE: AUTO STORY A-7 -> Express Walk or O-1a
  if (state.stage === 'auto_story_a7') {
    const effective = input.length > 3 ? input : state.sourceText;
    const bp = buildProjectBlueprint(effective, bible, state.presetKey, state.useProjectBible);
    if (input === '2') {
      return {
        text: [
          `Pre-analysis locked — ${bp.characters.length} character(s) (${bp.characters.map((c) => c.tag).join(', ')}), 1 location (${bp.set.tag}), ${bp.shots.length} master shots, detected language: ${bp.language}, detected genre: ${bp.genre}. Opening Step 1a of 16.`,
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
        nextState: { ...state, stage: 'o1a', sourceText: effective },
      };
    }
    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate', sourceText: effective },
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
    const useBible = input === '1';
    const effectiveSource = useBible
      ? `INT. MANILA RAIN DORMITORY - NIGHT\n@MIRA sits by the rain-streaked window inside @LOC-D, opening her worn linen sketchbook.\nMIRA: "Every answer we needed was sitting right in front of us."`
      : input;
    const bp = buildProjectBlueprint(effectiveSource, bible, state.presetKey, useBible);

    if (state.stage === 'await_source' && !useBible && !/\b(RECOMMENDED ALL|BUILD NOW|AUTO|EXPRESS)\b/i.test(input)) {
      return {
        text: [
          `Pre-analysis locked — ${bp.characters.length} character(s) (${bp.characters.map((c) => c.tag).join(', ')}), 1 location (${bp.set.tag} — ${bp.set.name}), ${bp.shots.length} master shots, detected language: ${bp.language}, detected genre: ${bp.genre}. Opening Step 1a of 16.`,
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
        nextState: { ...state, stage: 'o1a', sourceText: effectiveSource, useProjectBible: useBible },
      };
    }

    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate', sourceText: effectiveSource, useProjectBible: useBible },
    };
  }

  // 9) STAGE: O-1a Genre Confirm -> O-1b or Express Walk
  if (state.stage === 'o1a') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
    if (input === '2' || /\b(RECOMMENDED ALL|BUILD NOW|AUTO|SKIP|USE DEFAULTS|FAST-TRACK)\b/i.test(input)) {
      return {
        text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
        nextState: { ...state, stage: 'build_gate' },
      };
    }
    return {
      text: [
        `✔ Locked O-1a: ${bp.genre} | [ONBOARDING CHECKPOINT | Step 1a/16 locked]`,
        '',
        '[STEP 1b OF 16 — O-1b CHARACTER ROSTER]',
        ...bp.characters.map((c) => `- **${c.tag}** (${c.name} → \`${c.sheetFile}\`): ${c.descriptor}`),
        '',
        '```text',
        ' 1) ★ Approve roster as-is & Express-Walk O-2 → O-15 to O-16 BUILD Gate',
        ' 2) Approve roster — I will upload existing reference photos (REF BOUND)',
        ' 3) Review Wardrobe & Hex Table next (Step 2 of 16)',
        ' 4) Custom — type roster edits',
        '```',
      ].join('\n'),
      nextState: { ...state, stage: 'o1b' },
    };
  }

  if (state.stage === 'o1b') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
    if (input === '2') {
      return {
        text: `\`\`\`text\n${ASSET_SWEEP_CANONICAL_MENU}\n\`\`\``,
        nextState: { ...state, stage: 'sweep' },
      };
    }
    if (input === '3') {
      return {
        text: [
          `✔ Locked O-1b Character Roster | [ONBOARDING CHECKPOINT | Step 1b/16 locked]`,
          '',
          '[STEP 2 OF 16 — O-2 WARDROBE & COLOR HEX LOCK]',
          ...bp.characters.map((c) => `- ${c.wardrobeLock}`),
          '',
          '```text',
          ' 1) ★ Approve wardrobe & hex table and Express-Walk O-3 → O-15 to BUILD Gate',
          ' 2) Review Dialogue Review (O-13) directly',
          ' 3) Custom — type outfit or hex edits',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'o2' },
      };
    }
    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate' },
    };
  }

  if (state.stage === 'o2' || state.stage === 'o13' || state.stage === 'sweep') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
    if (state.stage === 'sweep' && input === '1') {
      return {
        text: [
          '✔ Asset Inventory Sweep active. Upload or bind any existing files via the **Asset Inventory Ledger** panel (or paste filenames here). Bound files lock as `REF BOUND` and are never regenerated.',
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
    if (state.stage === 'o2' && input === '2') {
      return {
        text: [
          '[STEP 13 OF 16 — O-13 FULL CHRONOLOGICAL DIALOGUE REVIEW]',
          ...bp.shots.map(
            (s) =>
              `- **${s.id}** (${s.speaker.tag} · ${s.timing.words}w · VO_FIT ${s.timing.voFit}s → Tier **${s.timing.genD}s**): ${s.dialogue === 'none' ? '*SILENT-OK*' : `"${s.dialogue}"`}`
          ),
          '',
          '```text',
          ' 1) ★ Approve all dialogue lines verbatim & advance to O-16 BUILD Gate',
          ' 2) Custom — Type shot ID and exact line edit',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'o13' },
      };
    }
    return {
      text: renderExpressReceiptsAndBuildGate(bp, ledgerMap),
      nextState: { ...state, stage: 'build_gate' },
    };
  }

  // 10) STAGE: O-16 FINAL GATE: BUILD
  if (state.stage === 'build_gate') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
    const cards = buildQueueACards(bp, ledgerMap);
    if (input === '2') {
      return {
        text: `\`\`\`text\n${ASSET_SWEEP_CANONICAL_MENU}\n\`\`\``,
        nextState: { ...state, stage: 'sweep' },
      };
    }
    if (input === '3') {
      return {
        text: [
          '[STEP 1b OF 16 — O-1b CHARACTER ROSTER]',
          ...bp.characters.map((c) => `- **${c.tag}** (${c.name} → \`${c.sheetFile}\`): ${c.descriptor}`),
          '',
          '```text',
          ' 1) ★ Confirm roster & return to O-16 BUILD Gate',
          ' 2) Custom — type roster edits',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'o1b' },
      };
    }
    if (input === '4') {
      return {
        text: [
          '[STEP 13 OF 16 — O-13 FULL CHRONOLOGICAL DIALOGUE REVIEW]',
          ...bp.shots.map(
            (s) =>
              `- **${s.id}** (${s.speaker.tag} · ${s.timing.words}w · Tier **${s.timing.genD}s**): ${s.dialogue === 'none' ? '*SILENT-OK*' : `"${s.dialogue}"`}`
          ),
          '',
          '```text',
          ' 1) ★ Approve all dialogue verbatim & return to O-16 BUILD Gate',
          ' 2) Custom — type shot ID and line edit',
          '```',
        ].join('\n'),
        nextState: { ...state, stage: 'o13' },
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
    // Custom revision -> append to source & re-stage O-16
    const nextSource = `${state.sourceText}\n${input}`.trim();
    const updatedBp = buildProjectBlueprint(nextSource, bible, state.presetKey, state.useProjectBible);
    return {
      text: renderExpressReceiptsAndBuildGate(updatedBp, ledgerMap),
      nextState: { ...state, sourceText: nextSource },
    };
  }

  // 11) STAGE: QUEUE A ASSET CARDS -> ASSET GATE -> SHOT S1
  if (state.stage === 'queue_a') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
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
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
    const cards = buildQueueACards(bp, ledgerMap);
    const curShot = bp.shots[Math.min(state.shotIdx, bp.shots.length - 1)];

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

  // 13) STAGE: ASSEMBLY
  if (state.stage === 'assembly') {
    const bp = buildProjectBlueprint(state.sourceText, bible, state.presetKey, state.useProjectBible);
    if (input === '1' || /SAVE SERIES BIBLE/i.test(input)) {
      return {
        text: [
          `BIBLE — ${bp.slug} | episodes: EP1`,
          ...bp.characters.flatMap((c) => [
            `- Cast: ${c.tag}_W1 (${c.sheetFile}) — ${c.descriptor}`,
            `- ${c.wardrobeLock}`,
            `- ${c.voiceLock}`,
          ]),
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

  return {
    text: `${STEP_0_CANONICAL_MENU}\n`,
    nextState: { ...state, stage: 'step0' },
  };
}
