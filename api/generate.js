const buckets=globalThis.__aiShortsGenerateRate||new Map();globalThis.__aiShortsGenerateRate=buckets;
function cors(req,res){const allowed=process.env.FRONTEND_ORIGIN||"";res.setHeader("Access-Control-Allow-Origin",allowed||"null");res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");}
function limited(req){const key=String(req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown").split(",")[0].trim();const now=Date.now(),a=(buckets.get(key)||[]).filter(t=>now-t<60000);if(a.length>=5){buckets.set(key,a);return true}a.push(now);buckets.set(key,a);return false}
function clean(s,max){return String(s||"").trim().slice(0,max)}
function fallback(topic){return {title:topic.slice(0,70),script:`Here is a quick Short about ${topic}. Stay to the end for the key idea. The most important thing to understand is that ${topic} can be explained simply. Think about the surprising detail, the real-world effect, and why it matters. That is the part most people miss.`,scenes:[{text:topic.slice(0,52),duration:4},{text:"THE SURPRISING PART",duration:4},{text:"HERE'S WHAT IT MEANS",duration:4},{text:"MOST PEOPLE MISS THIS",duration:4},{text:"REMEMBER THIS",duration:4},{text:"FOLLOW FOR MORE",duration:3}]}}
async function gemini(topic){
const key=process.env.GEMINI_API_KEY;if(!key)return fallback(topic);
const prompt=`Create a YouTube Short about: ${topic}. Return ONLY valid JSON with keys title, script, scenes. script should be 70-110 words, natural spoken English, strong hook. scenes must be an array of 6 objects, each with text (max 42 chars) and duration (3-5 seconds). No markdown.`;
const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{temperature:0.8,maxOutputTokens:700,responseMimeType:"application/json"}})});
const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Gemini request failed");
const raw=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();if(!raw)throw new Error("Gemini returned an empty response");
try{const x=JSON.parse(raw);if(!x.script||!Array.isArray(x.scenes))throw 0;return x}catch{throw new Error("Gemini returned invalid JSON")}}
async function eleven(script){
const key=process.env.ELEVENLABS_API_KEY;if(!key)return null;
const voice=process.env.ELEVENLABS_VOICE_ID||"JBFqnCBsd6RMkjVDRZzb";
const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,{method:"POST",headers:{"xi-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({text:script,model_id:"eleven_multilingual_v2"})});
if(!r.ok)throw new Error("ElevenLabs voice generation failed");
const buf=Buffer.from(await r.arrayBuffer());return buf.toString("base64")}
export default async function handler(req,res){
cors(req,res);if(req.method==="OPTIONS")return res.status(204).end();if(req.method!=="POST")return res.status(405).json({error:"POST required"});
if(!process.env.FRONTEND_ORIGIN)return res.status(503).json({error:"FRONTEND_ORIGIN is not configured"});
if(limited(req))return res.status(429).json({error:"Too many requests. Try again in a minute."});
const topic=clean(req.body?.topic,500);if(!topic)return res.status(400).json({error:"topic is required"});
try{const content=await gemini(topic);const audioBase64=await eleven(content.script);const scenes=Array.isArray(content.scenes)?content.scenes.slice(0,8).map(s=>({text:clean(s?.text,60),duration:Math.max(2,Math.min(6,Number(s?.duration)||4))})).filter(s=>s.text):[];
return res.status(200).json({ok:true,status:"ready",jobId:globalThis.crypto?.randomUUID?.()||`job-${Date.now()}`,topic,title:clean(content.title,100),script:clean(content.script,1400),scenes,audioBase64,format:"webm",render:"client-canvas"});}
catch(e){return res.status(502).json({error:e?.message||"Generation failed"})}}
