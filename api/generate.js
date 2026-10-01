export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"POST required"});
  const topic=String(req.body?.topic||"").trim();
  if(!topic) return res.status(400).json({error:"topic is required"});
  if(topic.length>500) return res.status(400).json({error:"topic must be 500 characters or less"});
  const jobId=globalThis.crypto?.randomUUID?.()||`job-${Date.now()}`;
  return res.status(202).json({
    jobId,
    status:"queued",
    topic,
    stages:["topic","research","script","voice","visuals","render"],
    message:"Job accepted. Provider execution will be added in the next backend stage."
  });
}
