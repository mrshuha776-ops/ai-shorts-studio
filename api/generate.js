import {dbConfigured,updateJob} from "./_db.js";\n\nconst buckets=globalThis.__aiShortsGenerateRate||new Map();globalThis.__aiShortsGenerateRate=buckets;
function cors(req,res){const defaults=["https://mrshuha776-ops.github.io/ai-shorts-studio","https://ai-shorts-studio-rust.vercel.app"];const configured=String(process.env.FRONTEND_ORIGIN||"").split(",").map(x=>x.trim()).filter(Boolean);const origins=[...new Set([...configured,...defaults])];const origin=String(req.headers.origin||"");let allowed=origins.includes(origin)?origin:"";try{const u=new URL(origin);if(!allowed&&u.protocol==="https:"&&u.hostname.endsWith(".vercel.app")&&u.hostname.startsWith("ai-shorts-studio-"))allowed=origin;}catch{}allowed=allowed||origins[0]||"null";res.setHeader("Access-Control-Allow-Origin",allowed);res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");}
function limited(req){const key=String(req.headers["x-forwarded-for"]||req.headers["x-real-ip"]||"unknown").split(",")[0].trim();const now=Date.now(),a=(buckets.get(key)||[]).filter(t=>now-t<60000);if(a.length>=5){buckets.set(key,a);return true}a.push(now);buckets.set(key,a);return false}
function clean(s,max){return String(s||"").trim().slice(0,max)}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function idealShotCount(scene, index){const duration=Number(scene?.duration)||4;const text=String(scene?.text||"");const words=text.split(/\s+/).filter(Boolean).length;const density=words>=11?1:words<=5?-1:0;const base=Math.round(duration/1.8);const hook=index===0?1:0;const count=base+density+hook;return clamp(count,duration<2.4?2:3,Math.min(6,Math.max(2,Math.ceil(duration/0.85))))}
function fallback(topic){return {title:topic.slice(0,70),script:`Here is a quick Short about ${topic}. Stay to the end for the key idea. The most important thing to understand is that ${topic} can be explained simply. Think about the surprising detail, the real-world effect, and why it matters. That is the part most people miss.`,scenes:[{text:topic.slice(0,52),duration:4},{text:"THE SURPRISING PART",duration:4},{text:"HERE'S WHAT IT MEANS",duration:4},{text:"MOST PEOPLE MISS THIS",duration:4},{text:"REMEMBER THIS",duration:4},{text:"FOLLOW FOR MORE",duration:3}]}}
async function gemini(topic,skills=[],options={}){
const key=process.env.GEMINI_API_KEY;if(!key)throw new Error("GEMINI_API_KEY is not configured in the Production environment");
const skillText=Array.isArray(skills)&&skills.length?skills.join(", "):"hook, story, visual, caption";
const language=String(options.language||"auto");
const duration=String(options.duration||"auto");
const visualStyle=String(options.visualStyle||"auto");
const prompt=`Create a high-retention YouTube Short about: ${topic}.
Active production skills: ${skillText}.
Language preference: ${language}. Duration target: ${duration}. Visual style: ${visualStyle}. Respect these preferences when they are not "auto".
Return ONLY valid JSON with keys title, script, scenes.
script: choose narration length from topic complexity: roughly 55-90 words for a simple Short, 90-170 for medium, 170-280 for complex. Write the narration and on-screen text in the same natural language as the topic. If the topic is Uzbek, use natural Uzbek (Latin script). If the topic is English, use natural English. Strong hook, fast pacing. Never pad just to make it longer.
HOOK RULE: First identify the single most important, surprising, useful, or emotionally strongest fact/claim inside the topic. Put that core point into the first spoken sentence or first two short sentences. Do NOT use a generic intro like "Here is a quick Short about..." and do NOT invent a stronger claim than the topic supports. The opening should immediately reveal enough value to stop a swipe, then create a specific open loop: explain why that point is true, what most people miss about it, or what consequence follows. The rest of the Short must pay off that open loop.
scenes: create as many story sections as the topic needs, normally 6-30 sections. Do NOT force a fixed scene count. Simple topics may use 6-10; medium 10-18; complex 18-30. Each scene has text (max 42 chars), duration (2-6 seconds), visualPrompt, effect, and shots (2-6 objects). Shot count must be earned by the scene: use fewer shots for a simple continuous idea and more shots when the narration contains distinct visual beats. Aim for roughly one meaningful visual change every 1.5-2.2 seconds, but never split a single idea just to increase the count. Total Short duration should follow topic complexity: normally 25-45 seconds for simple topics, 45-75 for medium, 75-120 for complex, never over 180 seconds. Each shot has text (max 42 chars), duration (0.7-2.5 seconds), startCue (a short exact phrase from the narration that this shot should visually illustrate), visualPrompt (different concrete visual from the scene), camera (wide, medium, close, macro, overhead, tracking, push-in, pull-out), transition (cut, flash, whip, dissolve), effect (zoom, pan, shake, particles, flash, glow, none). Total shot duration must approximately equal the scene duration. Avoid repeating the same visual or camera consecutively. Change visuals on semantic beats, reveals, claims, reactions, questions, or pattern interrupts—not an arbitrary fixed timer.
If Hook Master is active, make scene 1 the topic's strongest core point: reveal the important point immediately, then create curiosity about its explanation/consequence. The hook must be derived from the topic/script, not a generic template. If Visual Director is active, make every visualPrompt concrete, cinematic and different from the previous scene. If Retention is active, add a pattern interrupt around scene 3 or 4. If Caption Sync is active, keep scene text punchy and readable.
No markdown.`;
let r=null,d=null,lastError="Gemini request failed";
const models=["gemini-3.5-flash-lite","gemini-3.6-flash","gemini-3.7-flash","gemini-3.8-flash"];
for(const model of models){
  for(let attempt=0;attempt<2;attempt++){
    r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:3000,responseMimeType:"application/json",thinkingConfig:{thinkingLevel:"low"}}})});
    d=await r.json();
    if(r.ok)break;
    lastError=d?.error?.message||lastError;
    const code=Number(r.status);
    if(![408,429,500,502,503,504].includes(code))break;
    await new Promise(resolve=>setTimeout(resolve,1000*Math.pow(2,attempt)));
  }
  if(r?.ok)break;
}
if(!r?.ok)throw new Error(lastError);
const raw=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();if(!raw)throw new Error("Gemini returned an empty response");
try{const x=JSON.parse(raw);if(!x.script||!Array.isArray(x.scenes))throw 0;return x}catch{throw new Error("Gemini returned invalid JSON")}}
async function eleven(script){
const key=process.env.ELEVENLABS_API_KEY;if(!key)return null;
const voice=process.env.ELEVENLABS_VOICE_ID||"JBFqnCBsd6RMkjVDRZzb";
const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,{method:"POST",headers:{"xi-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({text:script,model_id:"eleven_multilingual_v2"})});
if(!r.ok)throw new Error("ElevenLabs voice generation failed");
const d=await r.json();return {audioBase64:d.audio_base64||null,alignment:d.alignment||null};
}
export default async function handler(req,res){
cors(req,res);if(req.method==="OPTIONS")return res.status(204).end();if(req.method!=="POST")return res.status(405).json({error:"POST required"});
if(limited(req))return res.status(429).json({error:"Too many requests. Try again in a minute."});
const topic=clean(req.body?.topic,500);if(!topic)return res.status(400).json({error:"topic is required"});
const jobId=clean(req.body?.jobId,100)||null;
try{
 const skills=Array.isArray(req.body?.skills)?req.body.skills.slice(0,8).map(x=>clean(x,30)):[];
 const options={language:clean(req.body?.language,20)||"auto",duration:clean(req.body?.duration,20)||"auto",visualStyle:clean(req.body?.visualStyle,30)||"auto"};
 if(jobId&&dbConfigured())await updateJob(jobId,{status:"running",current_step:"script",updated_at:new Date().toISOString()});
 const content=await gemini(topic,skills,options);
 if(jobId&&dbConfigured())await updateJob(jobId,{current_step:"voice",updated_at:new Date().toISOString()});
 const voice=await eleven(content.script);
 let scenes=Array.isArray(content.scenes)?content.scenes.slice(0,30).map(s=>({text:clean(s?.text,60),duration:Math.max(2,Math.min(6,Number(s?.duration)||4)),visualPrompt:clean(s?.visualPrompt,300),effect:["zoom","pan","shake","particles","flash","glow","none"].includes(s?.effect)?s.effect:"zoom",shots:s.shots})).filter(s=>s.text):[];
 if(!scenes.length)scenes=[{text:topic.slice(0,42),duration:4,visualPrompt:"clean cinematic vertical composition",effect:"zoom",shots:[]}];
 scenes=scenes.slice(0,30);
 scenes=scenes.map((s,si)=>{
  const rawShots=Array.isArray(s.shots)?s.shots:[];
  const targetShots=idealShotCount(s,si);
  let shots=rawShots.slice(0,targetShots).map(q=>({text:clean(q?.text||s.text,60),duration:Math.max(.7,Math.min(2.5,Number(q?.duration)||Math.max(.8,(Number(s.duration)||4)/Math.max(3,rawShots.length||3)))),visualPrompt:clean(q?.visualPrompt||s.visualPrompt||"cinematic vertical visual",300),camera:["wide","medium","close","macro","overhead","tracking","push-in","pull-out"].includes(q?.camera)?q.camera:"push-in",transition:["cut","flash","whip","dissolve"].includes(q?.transition)?q.transition:"cut",effect:["zoom","pan","shake","particles","flash","glow","none"].includes(q?.effect)?q.effect:(s.effect||"zoom")}));
  if(shots.length<2){const n=targetShots;const d=(Number(s.duration)||4)/n;shots=Array.from({length:n},(_,i)=>({text:s.text,duration:d,visualPrompt:(s.visualPrompt||"cinematic vertical visual")+"; shot "+(i+1),camera:["wide","close","tracking"][i%3],transition:i?"cut":"flash",effect:i===1?"pan":(s.effect||"zoom")}))}
  if(shots.length>targetShots)shots=shots.slice(0,targetShots);
  while(shots.length<targetShots){const i=shots.length;const d=(Number(s.duration)||4)/targetShots;shots.push({text:s.text,duration:d,visualPrompt:(s.visualPrompt||"cinematic vertical visual")+"; semantic variation "+(i+1),camera:["wide","medium","close","tracking","macro","overhead"][i%6],transition:i?"cut":"flash",effect:i%3===1?"pan":(s.effect||"zoom")})}
  const sum=shots.reduce((a,q)=>a+q.duration,0),target=Number(s.duration)||4,factor=target/sum;shots=shots.map(q=>({...q,duration:Math.max(.7,q.duration*factor)}));const corrected=shots.reduce((a,q)=>a+q.duration,0);shots[shots.length-1].duration+=target-corrected;return {...s,duration:target,shots};
 });
 const responseJobId=jobId||globalThis.crypto?.randomUUID?.()||`job-${Date.now()}`;
 const payload={ok:true,status:"ready",options,skills,jobId:responseJobId,topic,title:clean(content.title,100),script:clean(content.script,1400),scenes,audioBase64:voice?.audioBase64||null,voiceAlignment:voice?.alignment||null,format:"adaptive",render:"client-canvas",director:{stage:"directed",sceneCount:scenes.length,shotCount:scenes.reduce((n,s)=>n+s.shots.length,0),visualMode:"shot-engine-motion-graphics",nextUpgrade:"provider-backed-images"}};
 if(jobId&&dbConfigured())await updateJob(jobId,{status:"ready",current_step:"render",result:{title:payload.title,script:payload.script,scenes:payload.scenes,options,skills,format:payload.format,render:payload.render,director:payload.director},updated_at:new Date().toISOString()});
 return res.status(200).json(payload);
}catch(e){
 if(jobId&&dbConfigured()){try{await updateJob(jobId,{status:"failed",current_step:"failed",error_code:"generation_failed",error_message:String(e?.message||"Generation failed").slice(0,500),updated_at:new Date().toISOString()})}catch{}}
 return res.status(502).json({error:e?.message||"Generation failed",jobId});
}}