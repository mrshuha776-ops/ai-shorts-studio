const buckets = globalThis.__aiShortsViralRate || new Map();
globalThis.__aiShortsViralRate = buckets;

function cors(req, res) {
  const configured = String(process.env.FRONTEND_ORIGIN || '').split(',').map(x => { try { return new URL(x.trim()).origin; } catch { return x.trim(); } }).filter(Boolean);
  const allowed = new Set(['https://mrshuha776-ops.github.io', 'https://ai-shorts-studio-rust.vercel.app', ...configured]);
  const origin = String(req.headers.origin || '');
  if (allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
}
function clean(value, max) { return String(value || '').trim().slice(0, max); }
function limited(req) {
  const key = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter(x => now - x < 60000);
  if (hits.length >= 20) { buckets.set(key, hits); return true; }
  hits.push(now); buckets.set(key, hits); return false;
}
function words(text) { return clean(text, 1800).split(/\s+/).filter(Boolean); }
function firstSentence(script) { return clean(script, 1800).split(/[.!?\n]/).map(x => x.trim()).find(Boolean) || clean(script, 180); }
function makeHooks(topic, script) {
  const core = firstSentence(script) || clean(topic, 120);
  const short = core.length > 105 ? `${core.slice(0, 102)}…` : core;
  return [
    {type: 'reveal', text: short},
    {type: 'curiosity', text: `Ko‘pchilik ${clean(topic, 70)} haqida bitta muhim narsani bilmaydi.`},
    {type: 'question', text: `${clean(topic, 76)} nega aynan shunday ishlaydi?`},
    {type: 'contrarian', text: `${clean(topic, 76)} haqidagi eng mashhur fikr to‘liq to‘g‘ri emas.`},
    {type: 'story', text: `Bir qarashda oddiy ko‘rinadi. Ammo ${clean(topic, 65)} ortida kutilmagan sabab bor.`}
  ];
}
function scoreDimension(name, value, reason) { return {name, score: Math.round(Math.max(0, Math.min(100, value))), reason}; }
function evaluate(topic, script, scenes = []) {
  const text = clean(script, 1800), ws = words(text), first = firstSentence(text);
  const hook = Math.max(35, Math.min(98, 48 + (first.length >= 35 ? 12 : 0) + (/[?!]|surprising|never|why|eng|nega|hech/i.test(first) ? 20 : 0)));
  const pacing = Math.max(35, Math.min(98, 96 - Math.max(0, ws.length - 145) * .35 - (scenes.length < 6 ? 12 : 0)));
  const curiosity = Math.max(32, Math.min(96, 44 + (/[?!]|lekin|ammo|however|because|sababi|eng/i.test(text) ? 24 : 0) + (scenes.length >= 8 ? 12 : 0)));
  const clarity = Math.max(35, Math.min(98, 94 - (ws.length > 240 ? 22 : 0) - (first.length > 150 ? 12 : 0)));
  const cta = Math.max(30, Math.min(95, /(follow|obuna|comment|izoh|fikr|part|qism|subscribe|share)/i.test(text) ? 90 : 48));
  const dimensions = [
    scoreDimension('Hook strength', hook, hook >= 75 ? 'Opening reveals value or creates a clear question.' : 'Opening needs a sharper claim, question or contrast.'),
    scoreDimension('Pacing', pacing, pacing >= 75 ? 'Script length and scene density fit a Short.' : 'Shorten the middle or add meaningful beat changes.'),
    scoreDimension('Curiosity', curiosity, curiosity >= 75 ? 'Open loop or contrast is present.' : 'Add a specific unanswered question and payoff.'),
    scoreDimension('Clarity', clarity, clarity >= 75 ? 'The core idea is easy to follow.' : 'Use shorter sentences and one idea per beat.'),
    scoreDimension('CTA', cta, cta >= 75 ? 'CTA invites a concrete next action.' : 'Add a natural question or reason to follow.')
  ];
  const total = Math.round(dimensions.reduce((sum, x) => sum + x.score, 0) / dimensions.length);
  const timeline = [];
  let at = 0;
  for (const [sceneIndex, scene] of (Array.isArray(scenes) ? scenes : []).entries()) {
    const duration = Number(scene?.duration || 3);
    timeline.push({scene: sceneIndex + 1, start: Number(at.toFixed(2)), end: Number((at + duration).toFixed(2)), interrupt: sceneIndex === 0 || sceneIndex % 3 === 2 ? 'pattern-interrupt' : 'continuity'});
    at += duration;
  }
  return {score: total, tier: total >= 80 ? 'strong' : total >= 65 ? 'promising' : 'needs work', dimensions, hooks: makeHooks(topic, text), timeline, recommendation: dimensions.sort((a, b) => a.score - b.score).slice(0, 2).map(x => x.reason).join(' ')};
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({error: 'POST required'});
  if (limited(req)) return res.status(429).json({error: 'Too many requests. Try again in a minute.'});
  const topic = clean(req.body?.topic, 500), script = clean(req.body?.script, 1800);
  if (!topic && !script) return res.status(400).json({error: 'topic or script is required'});
  try {
    const result = evaluate(topic || 'this topic', script || topic, req.body?.scenes);
    return res.status(200).json({ok: true, mode: process.env.GEMINI_API_KEY ? 'hybrid-ready' : 'heuristic', ...result});
  } catch (error) { return res.status(500).json({error: error.message || 'viral score failed'}); }
}
