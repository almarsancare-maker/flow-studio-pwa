import assert from 'node:assert/strict';
import healthHandler from '../api/health.js';
import proxyHandler from '../api/proxy.js';
import imageHandler from '../api/image.js';
import seedanceHandler, {
  validateSeedanceDownloadUrl,
  validateSeedanceModel,
  validateSeedancePollUrl,
} from '../api/seedance.js';
import omniHandler, {
  sanitizeGeminiError,
  validateGeminiFileUri,
  validateGeminiInteractionId,
} from '../api/omni.js';
import directorV5Handler from '../api/director-v5.js';
import {
  MASTER_PROMPT_V503,
  MASTER_PROMPT_V503_BYTES,
  MASTER_PROMPT_V503_CHECKS,
  MASTER_PROMPT_V503_VERSION,
  STEP_0_CANONICAL_MENU,
} from '../api/_directorV5Prompt.js';
import { parseDirectorV5Output } from '../api/_directorV5Parser.js';
import { validateColabBaseUrl, validateColabPath } from '../api/_ssrf.js';

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  const res = {
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(obj) {
      body = obj;
      return res;
    },
    send(payload) {
      body = payload;
      return res;
    },
    end() {
      return res;
    },
    get result() {
      return { statusCode, headers, body };
    },
  };
  return res;
}

console.log('--- FlowStudio PWA Phase 2 API & SSRF Tests ---');

// Test 1: /api/health
{
  const res = createMockRes();
  await healthHandler({ method: 'GET' }, res);
  assert.equal(res.result.statusCode, 200);
  assert.equal(res.result.body.ok, true);
  assert.equal(res.result.body.engines.length, 4);
  console.log('[PASS] Test 1: /api/health returns all 4 engines + serverKeys');
}

// Test 2: Strict SSRF allowlist validation
{
  assert.equal(validateColabBaseUrl('https://cool-cinema-gpu.trycloudflare.com').ok, true);
  assert.equal(validateColabBaseUrl('http://cool-cinema-gpu.trycloudflare.com').ok, false);
  assert.equal(validateColabBaseUrl('https://169.254.169.254/latest/meta-data').ok, false);
  assert.equal(validateColabBaseUrl('https://127.0.0.1:7860').ok, false);
  assert.equal(validateColabBaseUrl('https://user:pass@cool-cinema-gpu.trycloudflare.com').ok, false);
  assert.equal(validateColabBaseUrl('https://evil.com/.trycloudflare.com').ok, false);
  assert.equal(validateColabBaseUrl('https://cool-cinema-gpu.trycloudflare.com:8443').ok, false);

  assert.equal(validateColabPath('/api/health').ok, true);
  assert.equal(validateColabPath('/api/job/job_1234abcd').ok, true);
  assert.equal(validateColabPath('/outputs/vid_123.mp4').ok, true);
  assert.equal(validateColabPath('/outputs/../../etc/passwd').ok, false);
  assert.equal(validateColabPath('/api/health?x=1').ok, false);
  assert.equal(validateColabPath('/admin/shell').ok, false);
  console.log('[PASS] Test 2: SSRF allowlist rejects private IPs, HTTP, credentials, ports & traversal');
}

// Test 3: /api/proxy rejects SSRF attempts with HTTP 400
{
  const res = createMockRes();
  await proxyHandler(
    { method: 'GET', query: { colabUrl: 'http://169.254.169.254', path: '/api/health' } },
    res
  );
  assert.equal(res.result.statusCode, 400);
  assert.equal(res.result.body.ok, false);
  console.log('[PASS] Test 3: /api/proxy blocks SSRF payload with HTTP 400');
}

// Test 4: Live /api/image ($0 cloud image generation)
{
  const res = createMockRes();
  await imageHandler(
    {
      method: 'POST',
      body: {
        prompt: 'Cinematic rain-soaked neon street in Manila at night, 35mm film still',
        width: 512,
        height: 288,
        seed: 424242,
        model: 'turbo',
      },
    },
    res
  );
  assert.equal(res.result.statusCode, 200, `Unexpected status: ${JSON.stringify(res.result.body)}`);
  assert.equal(res.result.body.ok, true);
  assert.ok(res.result.body.dataUrl.startsWith('data:image/'), 'Expected image Data URL');
  assert.ok(res.result.body.dataUrl.length > 4000, 'Expected non-empty image payload');
  console.log(
    `[PASS] Test 4: Live /api/image succeeded via ${res.result.body.provider} (${Math.round(
      res.result.body.dataUrl.length / 1024
    )} KB base64)`
  );
}

// Test 5: Seedance BYOK SSRF & allowlist guards
{
  assert.equal(validateSeedanceModel('replicate', 'bytedance/seedance-2.5').ok, true);
  assert.equal(validateSeedanceModel('replicate', 'evil/other-model').ok, false);
  assert.equal(validateSeedanceModel('fal', 'bytedance/seedance-2.5/image-to-video').ok, true);
  assert.equal(validateSeedanceModel('fal', 'https://169.254.169.254/meta').ok, false);

  assert.equal(
    validateSeedancePollUrl('replicate', 'https://api.replicate.com/v1/predictions/abc123').ok,
    true
  );
  assert.equal(
    validateSeedancePollUrl('replicate', 'https://evil.com/v1/predictions/abc123').ok,
    false
  );
  assert.equal(
    validateSeedancePollUrl('fal', 'https://queue.fal.run/bytedance/seedance-2.5/requests/r1/status').ok,
    true
  );
  assert.equal(validateSeedanceDownloadUrl('https://replicate.delivery/pbxt/vid.mp4').ok, true);
  assert.equal(validateSeedanceDownloadUrl('https://v3.fal.media/files/vid.mp4').ok, true);
  assert.equal(validateSeedanceDownloadUrl('http://127.0.0.1/secret.mp4').ok, false);

  const resMissingKey = createMockRes();
  await seedanceHandler({ method: 'POST', body: { action: 'verify', provider: 'replicate', apiKey: '' } }, resMissingKey);
  assert.equal(resMissingKey.result.statusCode, 400);

  const resBadDl = createMockRes();
  await seedanceHandler({ method: 'POST', body: { action: 'download', videoUrl: 'https://169.254.169.254/latest' } }, resBadDl);
  assert.equal(resBadDl.result.statusCode, 400);
  console.log('[PASS] Test 5: /api/seedance model, poll, and media download SSRF guards verified');
}

// Test 6: Gemini Omni 1.2 Flash SSRF, File URI allowlist & key redaction
{
  assert.equal(validateGeminiInteractionId('v1_abcDEF12345_xyz').ok, true);
  assert.equal(validateGeminiInteractionId('../../etc/passwd').ok, false);
  assert.equal(
    validateGeminiFileUri('https://generativelanguage.googleapis.com/v1beta/files/abc123XYZ:download?alt=media').ok,
    true
  );
  assert.equal(validateGeminiFileUri('https://169.254.169.254/v1beta/files/abc123').ok, false);
  assert.equal(validateGeminiFileUri('https://evil.com/files/abc123').ok, false);

  const redacted = sanitizeGeminiError(
    'Failed with key AIzaSyD123456789012345678901234567890 at ?key=secret123',
    'AIzaSyD123456789012345678901234567890'
  );
  assert.ok(!redacted.includes('AIzaSyD'), 'Key was not redacted');
  assert.ok(!redacted.includes('secret123'), 'Query key was not redacted');

  const resNoKey = createMockRes();
  await omniHandler({ method: 'POST', headers: {}, body: { action: 'verify', apiKey: '' } }, resNoKey);
  assert.equal(resNoKey.result.statusCode, 400);
  console.log('[PASS] Test 6: /api/omni interaction ID, File URI SSRF allowlist & key redaction verified');
}

// Test 7: Verbatim MASTER PROMPT v5.0.3 integrity (zero rules dropped)
{
  assert.equal(MASTER_PROMPT_V503_VERSION, '5.0.3');
  assert.equal(MASTER_PROMPT_V503_CHECKS, 78);
  assert.equal(Buffer.byteLength(MASTER_PROMPT_V503, 'utf8'), 129990);
  assert.equal(MASTER_PROMPT_V503_BYTES, 129990);
  for (const anchor of [
    'MASTER PROMPT v5.0.3',
    'ASSET INVENTORY SWEEP',
    'EXACT FILE ATTACHMENT LAW',
    'NEVER-REGENERATE LAW',
    'CHECKS: 78/78 PASS',
    'BLUEPRINT — NOT A FRAME',
    'FRAME QUARTET',
    '[STEP 0 — ENTRY QUESTION]',
    '[STEP 16 OF 16 — O-16 FINAL GATE: BUILD]',
  ]) {
    assert.ok(MASTER_PROMPT_V503.includes(anchor), `Missing v5.0.3 anchor: ${anchor}`);
  }
  const parsedStep0 = parseDirectorV5Output(STEP_0_CANONICAL_MENU);
  assert.equal(parsedStep0.options.length, 9, `Expected 9 canonical STEP 0 options, got ${parsedStep0.options.length}`);
  assert.equal(parsedStep0.stage, 'step0');
  console.log('[PASS] Test 7: Verbatim MASTER PROMPT v5.0.3 (129,990 bytes, 78/78 checks, 9 STEP 0 choices) verified');
}

// Test 8: /api/director-v5 GET metadata + init + Express Walk -> BUILD -> Queue A -> Shot S1 + REF BOUND skip
{
  const resGet = createMockRes();
  await directorV5Handler({ method: 'GET', headers: {} }, resGet);
  assert.equal(resGet.result.statusCode, 200);
  assert.equal(resGet.result.body.version, '5.0.3');
  assert.equal(resGet.result.body.checks, 78);

  // Step 0 Init
  const resInit = createMockRes();
  await directorV5Handler({ method: 'POST', headers: {}, body: { action: 'init' } }, resInit);
  assert.equal(resInit.result.statusCode, 200);
  assert.equal(resInit.result.body.ok, true);
  assert.equal(resInit.result.body.options.length, 9);

  // Choose 4 (Express Walk)
  const resExpress = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: '4',
        sessionState: resInit.result.body.sessionState,
        skipPollinations: true,
      },
    },
    resExpress
  );
  assert.equal(resExpress.result.statusCode, 200);
  assert.ok(resExpress.result.body.options.length >= 3);

  // Launch Express Walk with Option 1 -> stops at O-16 BUILD Gate
  const resGate = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: '1',
        sessionState: resExpress.result.body.sessionState,
        skipPollinations: true,
      },
    },
    resGate
  );
  assert.equal(resGate.result.statusCode, 200);
  assert.equal(resGate.result.body.stage, 'build_gate');
  assert.ok(resGate.result.body.text.includes('QUEUE A REQUIRED'), 'Express walk must mark unrendered sheets QUEUE A REQUIRED');

  // Click 1 (BUILD) -> emits 12-Item Kit (78/78 PASS) + Queue A Character 2x4 Sheet with ATTACH line
  const resBuild = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: '1',
        sessionState: resGate.result.body.sessionState,
        skipPollinations: true,
      },
    },
    resBuild
  );
  assert.equal(resBuild.result.statusCode, 200);
  assert.equal(resBuild.result.body.checksStamp, '78/78 PASS');
  assert.ok(resBuild.result.body.promptBlocks.length >= 1, 'Expected Queue A prompt block on BUILD');
  assert.ok(
    resBuild.result.body.promptBlocks[0].attachLine.startsWith('ATTACH:'),
    'Expected ATTACH: line on Queue A prompt block'
  );

  // Jump to Shot S1 -> verify Quartet + Queue B Video + Motion + 12-Cell Acceptance Card
  const resShot = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: '2',
        sessionState: resBuild.result.body.sessionState,
        skipPollinations: true,
      },
    },
    resShot
  );
  assert.equal(resShot.result.statusCode, 200);
  assert.equal(resShot.result.body.stage, 'shots');
  assert.ok(resShot.result.body.promptBlocks.some((b) => b.category === 'quartet'), 'Missing Frame Quartet block');
  assert.ok(resShot.result.body.promptBlocks.some((b) => b.category === 'queue_b_video'), 'Missing Queue B video block');
  assert.ok(resShot.result.body.acceptanceCard && resShot.result.body.acceptanceCard.cells.length === 12, 'Expected 12-cell Acceptance Card');

  // Verify Never-Regenerate Law: if all Queue A cards are REF BOUND, BUILD skips directly to Shot S1
  const preBoundLedger = [
    { filename: 'mira_w1_sheet.jpg', token: '@MIRA_W1', role: 'face lock', status: 'REF BOUND' },
    { filename: 'set_manila_rain_dormitory_sheet.jpg', token: '@SET-MANILA_RAIN_DORMITORY', role: 'spatial lock', status: 'REF BOUND' },
    { filename: 'set_manila_rain_dormitory_angles.jpg', token: '@SET-MANILA_RAIN_DORMITORY', role: 'spatial angles', status: 'REF BOUND' },
    { filename: 'blueprint_manila_rain_dormitory.jpg', token: '@SET-MANILA_RAIN_DORMITORY', role: 'blueprint', status: 'REF BOUND' },
    { filename: 'prop_sketchbook_sheet.jpg', token: '@PROP-SKETCHBOOK', role: 'prop lock', status: 'REF BOUND' },
  ];
  const resBoundBuild = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: '1',
        ledger: preBoundLedger,
        sessionState: resGate.result.body.sessionState,
        skipPollinations: true,
      },
    },
    resBoundBuild
  );
  assert.equal(resBoundBuild.result.statusCode, 200);
  assert.equal(resBoundBuild.result.body.sessionState.stage, 'shots', 'Should skip Queue A when all assets REF BOUND');
  console.log('[PASS] Test 8: /api/director-v5 STEP 0 -> Express Walk -> BUILD -> Queue A -> Shot S1 + REF BOUND skip verified');
}

// Test 9: Real custom screenplay parsing (CARLO & ELENA in INT. CEBU BAKERY - DAWN) with zero @MIRA leakage
{
  const customScript = [
    'INT. CEBU BAKERY - DAWN',
    'CARLO (35, tired baker in flour-dusted maroon apron) slams a metal tray of hot pandesal onto the stainless counter.',
    'ELENA (32, sharp-eyed sister in yellow blouse) holds an eviction notice.',
    'ELENA: "Three days, Carlo. That is all the landlord gave us."',
    'CARLO: "Then we bake double tonight."',
  ].join('\n');
  const starterBible = [
    { tag: '@MIRA', category: 'character', title: 'Mira', descriptor: '21yo Filipina woman' },
    { tag: '@LOC-D', category: 'location', title: 'Manila Rain Dormitory', descriptor: 'dorm room' },
  ];

  // Step 0 -> paste custom script (default zero-key browser request, NO skipPollinations flag!)
  // -> must route cleanly to O-1a with CARLO, ELENA, CEBU BAKERY (zero @MIRA, zero 20B garbled menu!)
  const rScript = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: customScript,
        bible: starterBible,
        sessionState: { stage: 'step0' },
      },
    },
    rScript
  );
  assert.equal(rScript.result.statusCode, 200);
  assert.notEqual(rScript.result.body.stage, 'step0', 'Custom script must NEVER bounce back to STEP 0');
  assert.ok(rScript.result.body.text.includes('O-1a GENRE CONFIRM GATE'), 'Must emit canonical O-1a GENRE CONFIRM GATE');
  assert.ok(rScript.result.body.text.includes('@CARLO'), 'Missing @CARLO in O-0 pre-analysis');
  assert.ok(rScript.result.body.text.includes('@ELENA'), 'Missing @ELENA in O-0 pre-analysis');
  assert.ok(/Cebu Bakery/i.test(rScript.result.body.text), 'Missing Cebu Bakery location');
  assert.ok(!/MIRA/i.test(rScript.result.body.text), 'Starter @MIRA leaked into custom script!');

  // Option 2 -> EXPRESS: FAST-TRACK ALL -> stops at O-16 BUILD Gate
  const rFast = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: '2',
        bible: starterBible,
        sessionState: rScript.result.body.sessionState,
        skipPollinations: true,
      },
    },
    rFast
  );
  assert.equal(rFast.result.body.stage, 'build_gate');
  assert.ok(rFast.result.body.text.includes('carlo_w1_sheet.jpg'), 'Missing carlo_w1_sheet.jpg');
  assert.ok(rFast.result.body.text.includes('elena_w1_sheet.jpg'), 'Missing elena_w1_sheet.jpg');

  // Option 1 -> BUILD -> verifies verbatim dialogue + multi-character Queue A + zero @MIRA leak
  const rBuild = createMockRes();
  await directorV5Handler(
    {
      method: 'POST',
      headers: {},
      body: {
        action: 'turn',
        userInput: '1',
        bible: starterBible,
        sessionState: rFast.result.body.sessionState,
        skipPollinations: true,
      },
    },
    rBuild
  );
  assert.equal(rBuild.result.body.checksStamp, '78/78 PASS');
  assert.ok(rBuild.result.body.text.includes('Three days, Carlo. That is all the landlord gave us.'), 'Verbatim ELENA dialogue lost!');
  assert.ok(rBuild.result.body.text.includes('Then we bake double tonight.'), 'Verbatim CARLO dialogue lost!');
  assert.ok(rBuild.result.body.promptBlocks[0].assetFilename === 'carlo_w1_sheet.jpg', 'Expected Queue A Card 1 = carlo_w1_sheet.jpg');
  assert.ok(!/MIRA/i.test(rBuild.result.body.text), 'Starter @MIRA leaked into BUILD kit!');
  console.log('[PASS] Test 9: Real custom screenplay (CARLO & ELENA @ CEBU BAKERY) parsed verbatim with 0 starter leakage');
}

console.log('ALL_PHASE2_API_TESTS_PASSED');
