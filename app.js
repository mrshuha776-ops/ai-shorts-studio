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
async function renderShort(data){
setStage(5,"active");$("#overallStatus").textContent="Rendering cinematic 9:16…";
const canvas=document.createElement("canvas");canvas.width=540;canvas.height=960;const ctx=canvas.getContext("2d");
const scenes=data.scenes?.length?data.scenes:[{text:data.topic,duration:5},{text:"THE SURPRISING PART",duration:4},{text:"HERE'S WHAT IT MEANS",duration:4},{text:"MOST PEOPLE MISS THIS",duration:4},{text:"FOLLOW FOR MORE",duration:3}];
const total=scenes.reduce((a,s)=>a+s.duration,0);let audioEl=null,audioCtx=null,dest=null;
if(data.audioBase64){audioEl=new Audio("data:audio/mpeg;base64,"+data.audioBase64);audioEl.preload="auto";audioCtx=new AudioContext();dest=audioCtx.createMediaStreamDestination();const source=audioCtx.createMediaElementSource(audioEl);source.connect(dest);source.connect(audioCtx.destination)}
const stream=canvas.captureStream(30);if(dest)dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
const mime=MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":"video/webm";
const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5500000});const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
const finished=new Promise(resolve=>rec.onstop=()=>resolve(new Blob(chunks,{type:"video/webm"})));
const started=performance.now();rec.start(250);if(audioEl){await audioCtx.resume();audioEl.play().catch(()=>{})}
const particles=Array.from({length:42},(_,i)=>({x:(i*97)%540,y:(i*173)%960,r:2+(i%4),speed:.15+(i%5)*.07,phase:i*1.7}));
function wrap(text,max=440){const words=String(text).split(/\s+/),lines=[];let line="";for(const w of words){const t=line?line+" "+w:w;if(ctx.measureText(t).width>max&&line){lines.push(line);line=w}else line=t}if(line)lines.push(line);return lines}
function draw(t){
const elapsed=(t-started)/1000;if(elapsed>=total){rec.stop();stream.getTracks().forEach(x=>x.stop());return}
let acc=0,idx=0;for(let i=0;i<scenes.length;i++){if(elapsed>=acc+scenes[i].duration)acc+=scenes[i].duration;else{idx=i;break}}
const scene=scenes[idx],local=elapsed-acc,p=Math.min(1,local/scene.duration),next=idx<scenes.length-1?scenes[idx+1]:null;
const hue=(idx*67+215)%360,zoom=1+p*.055,fade=Math.min(1,local/.35,(scene.duration-local)/.35);
ctx.save();ctx.translate(270,480);ctx.scale(zoom,zoom);ctx.translate(-270,-480);
const g=ctx.createLinearGradient(0,0,540,960);g.addColorStop(0,`hsl(${hue} 72% 8%)`);g.addColorStop(.55,`hsl(${(hue+28)%360} 80% 16%)`);g.addColorStop(1,`hsl(${(hue+65)%360} 85% 28%)`);ctx.fillStyle=g;ctx.fillRect(-20,-20,580,1000);
ctx.globalAlpha=.16;for(let k=0;k<4;k++){ctx.beginPath();ctx.arc(80+k*150,210+k*145,100+k*28+Math.sin(t/800+k)*15,0,Math.PI*2);ctx.fillStyle=`hsl(${(hue+40+k*25)%360} 90% 65%)`;ctx.fill()}ctx.globalAlpha=1;
particles.forEach(q=>{const x=(q.x+Math.sin(t/1600+q.phase)*35+540)%540,y=(q.y-t*q.speed*.05+9600)%960;ctx.globalAlpha=.16+(q.r%3)*.08;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x,y,q.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
ctx.strokeStyle="rgba(255,255,255,.13)";ctx.lineWidth=1;for(let y=0;y<960;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(540,y);ctx.stroke()}for(let x=0;x<540;x+=90){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,960);ctx.stroke()}
ctx.fillStyle="rgba(255,255,255,.9)";ctx.font="800 16px Arial";ctx.textAlign="left";ctx.fillText("AI SHORTS",34,54);ctx.fillStyle="rgba(255,255,255,.45)";ctx.font="600 12px Arial";ctx.fillText(`0${idx+1} / 0${scenes.length}`,445,54);
const lines=wrap(scene.text),sy=450-(lines.length-1)*32;ctx.textAlign="center";ctx.font="900 44px Arial";ctx.shadowColor=`hsla(${hue},90%,70%,.45)`;ctx.shadowBlur=24;
lines.forEach((line,n)=>{const rise=Math.min(1,local/.28)*18;ctx.globalAlpha=fade;ctx.fillStyle="#fff";ctx.fillText(line,270,sy+n*64+rise)});ctx.shadowBlur=0;ctx.globalAlpha=1;
if(local<.55){ctx.fillStyle=`hsla(${hue},90%,65%,.8)`;ctx.fillRect(45,390,Math.min(450,450*local/.55),4)}
if(scene.effect==="shake"){ctx.translate(Math.sin(t/35)*3,Math.cos(t/28)*3)}
if(scene.effect==="flash"&&local<.28){ctx.fillStyle=`rgba(255,255,255,${Math.max(0,.28-local)/.28*.32})`;ctx.fillRect(0,0,540,960)}
if(scene.effect==="glow"){ctx.globalCompositeOperation="screen";ctx.globalAlpha=.12;ctx.fillStyle=`hsl(${hue} 100% 70%)`;ctx.fillRect(0,0,540,960);ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1}
ctx.restore();
const progress=(acc+local)/total;ctx.fillStyle="rgba(255,255,255,.18)";ctx.fillRect(45,858,450,5);ctx.fillStyle="#fff";ctx.fillRect(45,858,450*progress,5);
const v=ctx.createRadialGradient(270,480,280,270,480,600);v.addColorStop(0,"rgba(0,0,0,0)");v.addColorStop(1,"rgba(0,0,0,.58)");ctx.fillStyle=v;ctx.fillRect(0,0,540,960);
if(next&&scene.duration-local<.32){ctx.fillStyle=`rgba(255,255,255,${Math.min(.22,(scene.duration-local)/.32*.22)})`;ctx.fillRect(0,0,540,960)}
requestAnimationFrame(draw)}
requestAnimationFrame(draw);const blob=await finished;if(audioCtx)await audioCtx.close();return URL.createObjectURL(blob)}
async function generate(){
if(running)return;running=true;const value=topic.value.trim();if(!value){topic.focus();running=false;return}
$("#generateBtn").disabled=true;$("#downloadBtn").disabled=true;$("#overallStatus").textContent="Generating…";$("#previewTitle").textContent=value.length>72?value.slice(0,69)+"…":value;resetStages();setStage(0,"active");
try{const base=apiBase();if(!base)throw new Error("Backend URL is not configured");const response=await fetch(base+"/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:value,skills:selectedSkills()})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Generation failed");
setStage(0,"done");setStage(1,"active");await new Promise(r=>setTimeout(r,150));setStage(1,"done");setStage(2,"active");await new Promise(r=>setTimeout(r,150));setStage(2,"done");
if(data.audioBase64){setStage(3,"active");await new Promise(r=>setTimeout(r,100));setStage(3,"done")}else setStage(3,"done");
setStage(4,"active");$("#previewSub").textContent=data.script?data.script.slice(0,150)+"…":"Animated scenes ready";await new Promise(r=>setTimeout(r,200));setStage(4,"done");
lastVideoUrl=await renderShort(data);$("#downloadBtn").disabled=false;$("#downloadBtn").onclick=()=>{const a=document.createElement("a");a.href=lastVideoUrl;a.download=(data.title||"ai-short").replace(/[^a-z0-9]+/gi,"-").toLowerCase()+".webm";a.click()};setStage(5,"done");$("#overallStatus").textContent=data.audioBase64?"Short ready • voice included":"Short ready • add ElevenLabs for voice";$("#previewTitle").textContent=data.title||value;
}catch(error){$("#overallStatus").textContent=error.message||"Backend error";resetStages()}finally{$("#generateBtn").disabled=false;running=false}}
async function askAssistant(){const input=$("#assistantInput"),q=input.value.trim();if(!q)return;const box=$("#assistantMessages");box.insertAdjacentHTML("beforeend",`<div class="assistant-msg user">${escapeHtml(q)}</div>`);input.value="";const base=apiBase();if(!base){box.insertAdjacentHTML("beforeend",'<div class="assistant-msg">Backend URL sozlanmagan. Settings → Backend URL ni kiriting.</div>');return}try{const r=await fetch(base+"/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q,topic:topic.value.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Assistant error");box.insertAdjacentHTML("beforeend",`<div class="assistant-msg">${escapeHtml(d.text||"No response")}</div>`);box.scrollTop=box.scrollHeight}catch(e){box.insertAdjacentHTML("beforeend",`<div class="assistant-msg">Xatolik: ${escapeHtml(e.message)}</div>`)}}
$("#generateBtn").onclick=generate;$("#settingsBtn").onclick=()=>dialog.showModal();$("#openSettings").onclick=()=>dialog.showModal();$("#assistantBtn").onclick=()=>assistantDialog.showModal();$("#assistantForm").addEventListener("submit",e=>{if(e.submitter?.value==="send"){e.preventDefault();askAssistant()}});
$("#settingsForm").addEventListener("submit",e=>{if(e.submitter?.value!=="save")return;localStorage.setItem("ai-shorts-providers",JSON.stringify({gemini:$("#geminiKey").value?"configured":"",text:$("#textKey").value,voice:$("#voiceKey").value,visual:$("#visualKey").value}));localStorage.setItem("ai-shorts-api-base",$("#backendUrl").value.trim());syncProviders()});
function syncProviders(){try{const x=JSON.parse(localStorage.getItem("ai-shorts-providers")||"{}");[["geminiProvider",x.gemini],["textProvider",x.text],["voiceProvider",x.voice],["visualProvider",x.visual]].forEach(([id,v])=>{const el=$("#"+id);el.textContent=v||"Not connected";el.previousElementSibling?.classList.toggle("on",!!v)});$("#backendUrl").value=localStorage.getItem("ai-shorts-api-base")||""}catch{}}
syncProviders();