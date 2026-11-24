import { setCorsHeaders } from './_ssrf.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    ok: true,
    service: 'FlowStudio PWA Zero-Cost API',
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
    ],
    timestamp: new Date().toISOString(),
  });
}
