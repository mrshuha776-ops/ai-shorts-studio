function cors(req, res) {
  const configured = String(process.env.FRONTEND_ORIGIN || '').split(',').map(x => { try { return new URL(x.trim()).origin; } catch { return x.trim(); } }).filter(Boolean);
  const allowed = new Set(['https://mrshuha776-ops.github.io', 'https://ai-shorts-studio-rust.vercel.app', ...configured]);
  const origin = String(req.headers.origin || '');
  if (allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'POST required'});
  const worker = String(process.env.RENDER_WORKER_URL || '').replace(/\/$/, '');
  if (!worker) return res.status(503).json({error: 'RENDER_WORKER_URL is not configured', code: 'render_worker_not_configured'});
  try {
    const response = await fetch(`${worker}/render`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(process.env.RENDER_WORKER_TOKEN ? {authorization: `Bearer ${process.env.RENDER_WORKER_TOKEN}`} : {})},
      body: JSON.stringify(req.body || {})
    });
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {error: text}; }
    if (data.artifact && data.artifact.startsWith('/')) data.artifact = `${worker}${data.artifact}`;
    return res.status(response.status).json(data);
  } catch (error) { return res.status(502).json({error: error.message || 'Render worker unreachable'}); }
}
