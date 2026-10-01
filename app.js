const names=[["Topic","Input"],["Research","AI plan"],["Script","Hook + story"],["Voice","Narration"],["Visuals","Scenes"],["Render","Final 9:16"]];
const skillInputs=[...document.querySelectorAll("#skills input")];
skillInputs.forEach(i=>i.addEventListener("change",()=>i.closest(".skill").classList.toggle("active",i.checked)));
function selectedSkills(){return skillInputs.filter(i=>i.checked).map(i=>i.value)}const $=s=>document.querySelector(s);const topic=$("#topic"),pipeline=$("#pipeline"),dialog=$("#settingsDialog"),assistantDialog=$("#assistantDialog");let running=false,lastVideoUrl="";
names.forEach((x,i)=>pipeline.insertAdjacentHTML("beforeend",`<div class="stage" id="stage-${i}"><div class="num">${i+1}</div><strong>${x[0]}</strong><small>${x[1]}</small></div>`));
topic.addEventListener("input",()=>$("#charCount").textContent=`${topic.value.length} / 500`);
document.querySelectorAll("[data-topic]").forEach(b=>b.onclick=()=>{topic.value=b.dataset.topic;topic.dispatchEvent(new Event("input"));topic.focus()});
function apiBase(){return(localStorage.getItem("ai-shorts-api-base")||"").replace(/\/$/,"")}
function setStage(i,state){const s=$("#stage-"+i);s.classList.remove("active","done");if(state)s.classList.add(state)}
function resetStages(){document.querySelectorAll(".stage").forEach(x=>x.classList.remove("active","done"))}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function syncShotsToVoice(data){
 const alignment=data.voiceAlignment, script=String(data.script||"");
 if(!alignment?.characters?.length||!alignment.character_start_times_seconds?.length)return data;
 const chars=alignment.characters.join(""), starts=alignment.character_start_times_seconds, ends=alignment.character_end_times_seconds||[];
 let cursor=0;
 const shots=[];
 for(const scene of (data.scenes||[])){
   for(const shot of (scene.shots||[])){
     const cue=String(shot.startCue||shot.text||"").trim();
     let at=-1;
     if(cue){at=script.toLowerCase().indexOf(cue.toLowerCase(),cursor);if(at<0)at=script.toLowerCase().indexOf(cue.toLowerCase());}
     if(at>=0&&at<starts.length){shot._voiceStart=Number(starts[at])||0;const endIndex=Math.min(starts.length-1,at+cue.length-1);shot._voiceEnd=Number(ends[endIndex]||starts[endIndex]||0);cursor=Math.max(cursor,at+cue.length);}
     shots.push(shot);
   }
 }
 const found=shots.filter(s=>Number.isFinite(s._voiceStart));
 if(!found.length)return data;
 for(let i=0;i<shots.length;i++){
   const s=shots[i],next=shots[i+1];
   if(Number.isFinite(s._voiceStart)){
     const end=next&&Number.isFinite(next._voiceStart)?next._voiceStart:(ends.length?Number(ends[ends.length-1]):s._voiceStart+Number(s.duration||1));
     s.duration=Math.max(.35,end-s._voiceStart);s._syncStart=s._voiceStart;
   }
 }
 return data;
}

async function renderShort(data){
setStage(5,"active");data=syncShotsToVoice(data);$("#overallStatus").textContent="Syncing voice → shots → captions…";
const canvas=document.createElement("canvas");canvas.width=540;canvas.height=960;const ctx=canvas.getContext("2d");
const scenes=data.scenes?.length?data.scenes:[{text:data.topic,duration:5,shots:[]}];
const shots=[];
for(const scene of scenes){
  const ss=Array.isArray(scene.shots)&&scene.shots.length?scene.shots:[{text:scene.text,duration:scene.duration||4,visualPrompt:scene.visualPrompt||"",camera:"push-in",transition:"cut",effect:scene.effect||"zoom"}];
  ss.forEach((s,i)=>shots.push({...s,sceneText:scene.text,sceneIndex:scenes.indexOf(scene),shotIndex:i}));
}
const total=Math.max(shots.reduce((a,s)=>a+Number(s.duration||1),0), data.voiceAlignment?.character_end_times_seconds?.at(-1)||0);let audioEl=null,audioCtx=null,dest=null;
if(data.audioBase64){audioEl=new Audio("data:audio/mpeg;base64,"+data.audioBase64);audioEl.preload="auto";audioCtx=new AudioContext();dest=audioCtx.createMediaStreamDestination();const source=audioCtx.createMediaElementSource(audioEl);source.connect(dest);source.connect(audioCtx.destination)}
const stream=canvas.captureStream(30);if(dest)dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
const mp4Mime=MediaRecorder.isTypeSupported("video/mp4"),webmMime=MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":"video/webm",mime=mp4Mime?"video/mp4":webmMime,outputExt=mp4Mime?"mp4":"webm";
const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5500000});const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
const finished=new Promise(resolve=>rec.onstop=()=>resolve(new Blob(chunks,{type:mime})));
const started=performance.now();rec.start(200);if(audioEl){await audioCtx.resume();audioEl.play().catch(()=>{})}
const particles=Array.from({length:48},(_,i)=>({x:(i*97)%540,y:(i*173)%960,r:2+(i%4),speed:.15+(i%5)*.07,phase:i*1.7}));
function wrap(text,max=450){const words=String(text).split(/\s+/),lines=[];let line="";for(const w of words){const t=line?line+" "+w:w;if(ctx.measureText(t).width>max&&line){lines.push(line);line=w}else line=t}if(line)lines.push(line);return lines}
function draw(t){
 const elapsed=(t-started)/1000;if(elapsed>=total){rec.stop();stream.getTracks().forEach(x=>x.stop());return}
 let acc=0,idx=0;for(let i=0;i<shots.length;i++){if(elapsed>=acc+Number(shots[i].duration||1))acc+=Number(shots[i].duration||1);else{idx=i;break}}
 const shot=shots[idx],dur=Number(shot.duration||1),local=elapsed-acc,p=Math.min(1,local/dur),hue=(shot.sceneIndex*67+shot.shotIndex*31+215)%360;
 ctx.save();
 let sx=0,sy=0;if(shot.effect==="shake"){sx=Math.sin(t/28)*4;sy=Math.cos(t/24)*4}ctx.translate(sx,sy);
 const g=ctx.createLinearGradient(0,0,540,960);g.addColorStop(0,`hsl(${hue} 72% 7%)`);g.addColorStop(.5,`hsl(${(hue+35)%360} 80% 15%)`);g.addColorStop(1,`hsl(${(hue+75)%360} 85% 27%)`);ctx.fillStyle=g;ctx.fillRect(0,0,540,960);
 const cam=shot.camera||"push-in",motion=cam==="pull-out"?1-p:p,zoom=1+(cam==="wide"?.025:.04)*motion;
 ctx.translate(270,480);ctx.scale(zoom,zoom);ctx.translate(-270,-480);
 particles.forEach(q=>{const x=(q.x+Math.sin(t/1600+q.phase)*38+540)%540,y=(q.y-t*q.speed*.05+9600)%960;ctx.globalAlpha=.12+(q.r%3)*.08;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x,y,q.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
 ctx.strokeStyle="rgba(255,255,255,.1)";ctx.lineWidth=1;for(let y=0;y<960;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(540,y);ctx.stroke()}
 ctx.fillStyle="rgba(255,255,255,.9)";ctx.font="800 16px Arial";ctx.textAlign="left";ctx.fillText("AI SHORTS",34,54);ctx.fillStyle="rgba(255,255,255,.45)";ctx.font="600 12px Arial";ctx.fillText(`S${String(shot.sceneIndex+1).padStart(2,"0")} • CUT ${String(shot.shotIndex+1).padStart(2,"0")}`,405,54);
 const text=shot.text||shot.sceneText||"",lines=wrap(text),sy0=450-(lines.length-1)*32,fade=Math.min(1,local/.18,(dur-local)/.18);
 ctx.textAlign="center";ctx.font="900 42px Arial";ctx.shadowColor=`hsla(${hue},90%,70%,.45)`;ctx.shadowBlur=24;lines.forEach((line,n)=>{ctx.globalAlpha=fade;ctx.fillStyle="#fff";ctx.fillText(line,270,sy0+n*62+Math.min(18,local*65))});ctx.shadowBlur=0;ctx.globalAlpha=1;
 if(shot.effect==="flash"&&local<.18){ctx.fillStyle=`rgba(255,255,255,${(.18-local)/.18*.35})`;ctx.fillRect(0,0,540,960)}
 if(shot.effect==="glow"){ctx.globalAlpha=.12;ctx.fillStyle=`hsl(${hue} 100% 70%)`;ctx.fillRect(0,0,540,960);ctx.globalAlpha=1}
 ctx.restore();
 const progress=(acc+local)/total;ctx.fillStyle="rgba(255,255,255,.18)";ctx.fillRect(45,858,450,5);ctx.fillStyle="#fff";ctx.fillRect(45,858,450*progress,5);
 const v=ctx.createRadialGradient(270,480,280,270,480,600);v.addColorStop(0,"rgba(0,0,0,0)");v.addColorStop(1,"rgba(0,0,0,.58)");ctx.fillStyle=v;ctx.fillRect(0,0,540,960);
 if((shot.transition==="flash"||shot.transition==="whip")&&local<.12){ctx.fillStyle=`rgba(255,255,255,${(.12-local)/.12*.22})`;ctx.fillRect(0,0,540,960)}
 requestAnimationFrame(draw);
}
requestAnimationFrame(draw);const blob=await finished;if(audioCtx)await audioCtx.close();return {url:URL.createObjectURL(blob),ext:outputExt,shotCount:shots.length};
}
async function generate(){
if(running)return;running=true;const value=topic.value.trim();if(!value){topic.focus();running=false;return}
$("#generateBtn").disabled=true;$("#downloadBtn").disabled=true;$("#overallStatus").textContent="Generating…";$("#previewTitle").textContent=value.length>72?value.slice(0,69)+"…":value;resetStages();setStage(0,"active");
try{const base=apiBase();if(!base)throw new Error("Backend URL is not configured");const response=await fetch(base+"/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:value,skills:selectedSkills()})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Generation failed");
setStage(0,"done");setStage(1,"active");await new Promise(r=>setTimeout(r,150));setStage(1,"done");setStage(2,"active");await new Promise(r=>setTimeout(r,150));setStage(2,"done");
if(data.audioBase64){setStage(3,"active");await new Promise(r=>setTimeout(r,100));setStage(3,"done")}else setStage(3,"done");
setStage(4,"active");$("#previewSub").textContent=data.script?data.script.slice(0,150)+"…":"Animated scenes ready";await new Promise(r=>setTimeout(r,200));setStage(4,"done");
const rendered=await renderShort(data);lastVideoUrl=rendered.url;$("#downloadBtn").disabled=false;$("#downloadBtn").onclick=()=>{const a=document.createElement("a");a.href=lastVideoUrl;a.download=(data.title||"ai-short").replace(/[^a-z0-9]+/gi,"-").toLowerCase()+"."+rendered.ext;a.click()};setStage(5,"done");$("#overallStatus").textContent=`Short ready • ${rendered.ext.toUpperCase()} • ${rendered.shotCount} visual cuts${data.audioBase64?" • voice included":""}`;$("#previewTitle").textContent=data.title||value;
}catch(error){$("#overallStatus").textContent=error.message||"Backend error";resetStages()}finally{$("#generateBtn").disabled=false;running=false}}
async function askAssistant(){const input=$("#assistantInput"),q=input.value.trim();if(!q)return;const box=$("#assistantMessages");box.insertAdjacentHTML("beforeend",`<div class="assistant-msg user">${escapeHtml(q)}</div>`);input.value="";const base=apiBase();if(!base){box.insertAdjacentHTML("beforeend",'<div class="assistant-msg">Backend URL sozlanmagan. Settings → Backend URL ni kiriting.</div>');return}try{const r=await fetch(base+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q,topic:topic.value.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Assistant error");box.insertAdjacentHTML("beforeend",`<div class="assistant-msg">${escapeHtml(d.text||"No response")}</div>`);box.scrollTop=box.scrollHeight}catch(e){box.insertAdjacentHTML("beforeend",`<div class="assistant-msg">Xatolik: ${escapeHtml(e.message)}</div>`)}}
$("#generateBtn").onclick=generate;$("#settingsBtn").onclick=()=>dialog.showModal();$("#openSettings").onclick=()=>dialog.showModal();$("#assistantBtn").onclick=()=>assistantDialog.showModal();$("#assistantForm").addEventListener("submit",e=>{if(e.submitter?.value==="send"){e.preventDefault();askAssistant()}});
$("#settingsForm").addEventListener("submit",e=>{if(e.submitter?.value!=="save")return;localStorage.setItem("ai-shorts-providers",JSON.stringify({gemini:$("#geminiKey").value?"configured":"",text:$("#textKey").value,voice:$("#voiceKey").value,visual:$("#visualKey").value}));localStorage.setItem("ai-shorts-api-base",$("#backendUrl").value.trim());syncProviders()});
function syncProviders(){try{const x=JSON.parse(localStorage.getItem("ai-shorts-providers")||"{}");[["geminiProvider",x.gemini],["textProvider",x.text],["voiceProvider",x.voice],["visualProvider",x.visual]].forEach(([id,v])=>{const el=$("#"+id);el.textContent=v||"Not connected";el.previousElementSibling?.classList.toggle("on",!!v)});$("#backendUrl").value=localStorage.getItem("ai-shorts-api-base")||""}catch{}}
syncProviders();