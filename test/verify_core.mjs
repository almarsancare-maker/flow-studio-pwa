import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Pure ESM verification of Phase 1 core modules (prompt compiler + shot-list parser + manifest/config)
// We strip TypeScript type syntax lightly or run via Node 24's built-in TypeScript type stripping!
import {
  compilePromptWithBible,
  normalizeTag,
  parseScriptShotList,
} from '../src/utils/promptCompiler.ts';

console.log('--- FlowStudio PWA Phase 1 Core Tests ---');

// Test 1: Tag normalization
assert.equal(normalizeTag('mira'), '@MIRA');
assert.equal(normalizeTag('@@loc-d '), '@LOC-D');
assert.equal(normalizeTag('   '), '');
console.log('[PASS] Test 1: @TAG normalization');

// Test 2: Character & Location Bible expansion + locked seed/ref inheritance
const bible = [
  {
    id: 'b1',
    projectId: 'p1',
    tag: '@MIRA',
    category: 'character',
    title: 'Mira',
    descriptor: '21yo Filipina woman, shoulder-length black hair, cream knit cardigan',
    lockedSeed: 778899,
    refImageDataUrl: 'data:image/png;base64,AAAA',
    createdAt: 1,
  },
  {
    id: 'b2',
    projectId: 'p1',
    tag: '@LOC-D',
    category: 'location',
    title: 'Manila Dormitory',
    descriptor: 'cramped 1990s dorm room at night, warm desk lamp, sodium-blue window glow',
    createdAt: 2,
  },
];

const compiled = compilePromptWithBible(
  'Medium close-up of @mira sketching at a desk inside @LOC-D, holding @mira sketchbook, @UNKNOWN untouched',
  bible
);
assert.ok(compiled.compiledPrompt.includes('Mira (21yo Filipina woman, shoulder-length black hair, cream knit cardigan)'));
assert.ok(compiled.compiledPrompt.includes('Manila Dormitory (cramped 1990s dorm room at night'));
assert.ok(compiled.compiledPrompt.includes('@UNKNOWN'));
assert.deepEqual(compiled.appliedTags, ['@MIRA', '@LOC-D']);
assert.equal(compiled.suggestedSeed, 778899);
assert.equal(compiled.suggestedRefImage, 'data:image/png;base64,AAAA');
console.log('[PASS] Test 2: Character & Location Bible @TAG expansion + seed/ref lock');

// Test 3: Bulk Script Shot-List Parser (fixes Flow Con #7)
const script = `
S1: [16:9] [5s] [t2v] @MIRA walks into @LOC-D under rain
SH02 - [9:16] [image] Close-up of @MIRA holding wallet photo
Scene 3: [10s] [i2v] Slow push-in on @LOC-D window glow
`;
const parsed = parseScriptShotList(script, 't2i');
assert.equal(parsed.length, 3);
assert.equal(parsed[0].label, 'S01');
assert.equal(parsed[0].aspectRatio, '16:9');
assert.equal(parsed[0].durationSec, 5);
assert.equal(parsed[0].mode, 't2v');
assert.deepEqual(parsed[0].detectedTags, ['@MIRA', '@LOC-D']);

assert.equal(parsed[1].label, 'S02');
assert.equal(parsed[1].aspectRatio, '9:16');
assert.equal(parsed[1].mode, 't2i');

assert.equal(parsed[2].label, 'S03');
assert.equal(parsed[2].durationSec, 10);
assert.equal(parsed[2].mode, 'i2v');
console.log('[PASS] Test 3: Bulk Script Shot-List Parser');

// Test 4: PWA & Vercel configuration integrity
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const vercelCfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
assert.equal(vercelCfg.outputDirectory, 'dist');
assert.ok(fs.existsSync(path.join(root, 'public', 'icon.svg')));
console.log('[PASS] Test 4: Vercel & PWA config files verified');

console.log('ALL_PHASE1_CORE_TESTS_PASSED');
