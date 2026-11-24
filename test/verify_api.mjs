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

console.log('ALL_PHASE2_API_TESTS_PASSED');
