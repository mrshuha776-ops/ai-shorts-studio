export default async function handler(req,res){
  const origin=process.env.FRONTEND_ORIGIN||"*";
  res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"POST required"});
  const message=String(req.body?.message||"").trim();
  const topic=String(req.body?.topic||"").trim();
  if(!message) return res.status(400).json({error:"message is required"});
  const key=process.env.GEMINI_API_KEY;
  if(!key) return res.status(503).json({error:"Gemini is not configured on the backend"});
  const prompt=`You are the AI Assistant inside AI Shorts Studio. Help the creator build YouTube Shorts. Be concise, practical and creative. Current topic: ${topic||"(not set)"}. User request: ${message}`;
  try{
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":key},
      body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}]})
    });
    const data=await response.json();
    if(!response.ok) return res.status(response.status).json({error:data?.error?.message||"Gemini request failed"});
    const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
    if(!text) return res.status(502).json({error:"Gemini returned an empty response"});
    return res.status(200).json({ok:true,text});
  }catch(error){
    return res.status(500).json({error:"Gemini connection failed"});
  }
}