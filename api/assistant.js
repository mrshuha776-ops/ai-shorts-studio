const buckets=globalThis.__aiShortsRate||new Map();globalThis.__aiShortsRate=buckets;
function cors(req,res){const origins=(process.env.FRONTEND_ORIGIN||"https://mrshuha776-ops.github.io/ai-shorts-studio,https://ai-shorts-studio-rust.vercel.app").split(",").map(x=>x.trim()).filter(Boolean);const origin=String(req.headers.origin||"");const allowed=origin&&origins.includes(origin)?origin:origins[0]||"null";res.setHeader("Access-Control-Allow-Origin",allowed);res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");}
function clientKey(req){return String(req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown").split(",")[0].trim()}
function limited(key){const now=Date.now(),windowMs=60000,max=10;const a=(buckets.get(key)||[]).filter(t=>now-t<windowMs);if(a.length>=max){buckets.set(key,a);return true}a.push(now);buckets.set(key,a);return false}
function clean(s,max){return String(s||"").trim().slice(0,max)}
export default async function handler(req,res){
 cors(req,res);if(req.method==="OPTIONS")return res.status(204).end();if(req.method!=="POST")return res.status(405).json({error:"POST required"});
if(limited(clientKey(req)))return res.status(429).json({error:"Too many requests. Try again in a minute."});
const message=clean(req.body?.message,1000),topic=clean(req.body?.topic,500);if(!message)return res.status(400).json({error:"message is required"});
const key=process.env.GEMINI_API_KEY;if(!key)return res.status(503).json({error:"Gemini is not configured on the backend"});
const prompt=`You are the AI Assistant inside AI Shorts Studio. Help the creator build YouTube Shorts. Be concise, practical and creative. Current topic: ${topic||"(not set)"}. User request: ${message}`;
try{
 const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.7,maxOutputTokens:800}})});
 const data=await response.json();if(!response.ok)return res.status(response.status).json({error:data?.error?.message||"Gemini request failed"});
 const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();if(!text)return res.status(502).json({error:"Gemini returned an empty response"});
 return res.status(200).json({ok:true,text});
}catch{return res.status(502).json({error:"Gemini connection failed"})}}
