import { setCorsHeaders } from './_ssrf.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    ok: true,
    service: 'Cabardo Studio AI Generator FREE Lifetime API',
    version: '1.0.0',
    engines: [
      {
        id: 'free-24-7',
        name: 'Free 24/7 Cloud (Pollinations FLUX + HF ZeroGPU)',
        cost: '$0',
      },
      {
        id: 'colab-t4',
        name: 'Free Google Colab NVIDIA T4 16GB (SDXL + CogVideoX/LTX)',
        cost: '$0',
      },
      {
        id: 'seedance-byok',
        name: 'Official ByteDance Seedance 2.5 / 2.0 (Replicate / fal.ai)',
        cost: 'BYOK',
      },
    ],
    serverKeys: {
      replicate: Boolean(process.env.REPLICATE_API_TOKEN && process.env.REPLICATE_API_TOKEN.trim()),
      fal: Boolean(process.env.FAL_KEY && process.env.FAL_KEY.trim()),
    },
    timestamp: new Date().toISOString(),
  });
}
