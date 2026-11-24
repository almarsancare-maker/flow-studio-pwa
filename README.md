# FlowStudio PWA — Zero-Cost AI Cinema Studio

A **$0-cost, installable Progressive Web App (PWA)** built for **Vercel Hobby Tier**, designed like **Google Flow** while systematically fixing all 7 major Google Flow limitations.

## The 7 Google Flow Cons Fixed

1. **Character & Location Drift** → Persistent **Character & Location Bible (`@TAG` Vault)** (`@MIRA`, `@LOC-D`, etc.) that auto-expands tags into locked visual descriptors, locked seeds, and optional reference stills.
2. **Clunky Scene-to-Scene Continuity** → **1-Click "Grab Current / Last Frame → Next Scene"** offscreen canvas frame grabber and **1-Click "Animate Still → I2V"** straight into the Start Frame slot.
3. **No Multi-Clip Sequence Assembly** → Docked **Storyboard Cut** timeline with reorderable scenes, **Continuous Multi-Scene Theater Playback**, and a **Browser-Native `MediaRecorder` Video Stitcher** (`WebM/MP4` export at `$0`).
4. **Black-Box Prompts / No Batch Queue** → Full shot recipes (`seed`, seed lock, `negativePrompt`, `steps`, `cfgScale`, model/provider) plus an auto-running sequential batch render queue.
5. **Expiring Cloud URLs & Profile Scatter** → Local-first **`IndexedDB` Binary Blob Vault** (`flowstudio_vault_v1`) that permanently caches every generated PNG/MP4 offline plus **1-Click Portable Project JSON** export.
6. **Credit Drain & Single-Provider Lock-In** → **Dual `$0` Compute Architecture**:
   - **Engine 1 (`Free 24/7 Cloud`)**: Always-on `$0` keyframe generation (Pollinations FLUX/Turbo + Hugging Face `FLUX.1-schnell` ZeroGPU automatic failover) + HF `LTX-Video` ZeroGPU / instant 2-stage local cinema motion fallback.
   - **Engine 2 (`Free Google Colab T4 16 GB`)**: Connect your own single-account Google Colab NVIDIA T4 GPU (`colab/FlowStudio_Colab_T4_Backend.ipynb`) via free `trycloudflare.com` quick tunnel (`SDXL-Turbo`, `SDXL 1.0`, `CogVideoX-2B`, `LTX-Video` T2V/I2V, `Wan2.1-1.3B`).
7. **Manual Copy-Pasting From Scripts** → **Bulk Script / Shot-List Importer** supporting `S1:`, `SH02 -`, `Scene 3:`, `[16:9]`/`[9:16]`, `[5s]`, `[t2i]`/`[t2v]`/`[i2v]`, and automatic `@TAG` detection.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5175`. Vite mounts the exact Vercel `/api/*` serverless routes locally during development.

## Automated Tests

```bash
npm run test:core   # @TAG Bible compiler, Bulk Script Parser, Vercel/PWA config
npm run test:api    # /api/health, strict SSRF allowlist, live $0 /api/image
npm run build       # TypeScript strict check + Vite PWA service worker bundle
python test/verify_e2e.py  # Headless Chromium E2E (all 7 fixes + IndexedDB reload)
```

## Connecting Free Google Colab T4 16 GB GPU ($0)

1. Open **Engine Settings** inside FlowStudio PWA and click **Download Colab Notebook** (or open `colab/FlowStudio_Colab_T4_Backend.ipynb`).
2. Upload to [Google Colab](https://colab.research.google.com/) and select **Runtime → Change runtime type → T4 GPU**.
3. Run **Step 1**, **Step 2**, and **Step 5** (`Start FlowStudio PWA Backend Server`).
4. Paste the printed `https://*.trycloudflare.com` URL into **Engine Settings → Colab T4 Tunnel URL** and click **Test Connection**.

## Deploy to Vercel ($0 Hobby Tier)

```bash
npx vercel --prod
```

Or import this GitHub repository directly at [vercel.com/new](https://vercel.com/new) — `vercel.json` is pre-configured for the Vite PWA output (`dist`) and `/api/*` Node serverless routes.
