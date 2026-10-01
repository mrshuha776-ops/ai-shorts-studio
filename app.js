const names=[["Topic","Input"],["Research","AI plan"],["Script","Hook + story"],["Voice","Narration"],["Visuals","Scenes"],["Render","Final 9:16"]];const $=s=>document.querySelector(s);const topic=$("#topic"),pipeline=$("#pipeline"),dialog=$("#settingsDialog"),assistantDialog=$("#assistantDialog");let running=false,lastVideoUrl="";
names.forEach((x,i)=>pipeline.insertAdjacentHTML("beforeend",`<div class="stage" id="stage-${i}"><div class="num">${i+1}</div><strong>${x[0]}</strong><small>${x[1]}</small></div>`));
topic.addEventListener("input",()=>$("#charCount").textContent=`${topic.value.length} / 500`);
document.querySelectorAll("[data-topic]").forEach(b=>b.onclick=()=>{topic.value=b.dataset.topic;topic.dispatchEvent(new Event("input"));topic.focus()});
function apiBase(){return(localStorage.getItem("ai-shorts-api-base")||"").replace(/\/$/,"")}
function setStage(i,state){const s=$("#stage-"+i);s.classList.remove("active","done");if(state)s.classList.add(state)}
function resetStages(){document.querySelectorAll(".stage").forEach(x=>x.classList.remove("active","done"))}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function renderShort(data){
setStage(5,"active");$("#overallStatus").textContent="Rendering 9:16…";
const canvas=document.createElement("canvas");canvas.width=540;canvas.height=960;const ctx=canvas.getContext("2d");
const scenes=data.scenes?.length?data.scenes:[{text:data.topic,duration:5},{text:"WATCH TILL THE END",duration:5},{text:"FOLLOW FOR MORE",duration:4}];
const total=scenes.reduce((a,s)=>a+s.duration,0);let audioEl=null,audioCtx=null,dest=null;
if(data.audioBase64){audioEl=new Audio("data:audio/mpeg;base64,"+data.audioBase64);audioEl.crossOrigin="anonymous";audioCtx=new AudioContext();dest=audioCtx.createMediaStreamDestination();const source=audioCtx.createMediaElementSource(audioEl);source.connect(dest);source.connect(audioCtx.destination)}
const stream=canvas.captureStream(30);if(dest)dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
const mime=MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")?"video/webm;codecs=vp9,opus":MediaRecorder.isTypeSupported("video/webm")?"video/webm":"video/webm";
const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4500000});const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
const finished=new Promise(resolve=>rec.onstop=()=>resolve(new Blob(chunks,{type:"video/webm"})));
const started=performance.now();rec.start(250);if(audioEl){await audioCtx.resume();audioEl.play().catch(()=>{})}
function draw(t){
const elapsed=(t-started)/1000;let acc=0,idx=0;for(let i=0;i<scenes.length;i++){if(elapsed>=acc+scenes[i].duration)acc+=scenes[i].duration;else{idx=i;break}}
const scene=scenes[idx],local=Math.max(0,elapsed-acc),p=Math.min(1,local/scene.duration);
const g=ctx.createLinearGradient(0,0,540,960);g.addColorStop(0,`hsl(${(idx*57+220)%360} 70% 10%)`);g.addColorStop(1,`hsl(${(idx*57+280)%360} 75% 22%)`);ctx.fillStyle=g;ctx.fillRect(0,0,540,960);
ctx.fillStyle="rgba(255,255,255,.08)";for(let i=0;i<9;i++){ctx.beginPath();ctx.arc(60+i*68,120+Math.sin(t/700+i)*45,18+(i%3)*8,0,Math.PI*2);ctx.fill()}
ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="800 22px Arial";ctx.fillText("AI SHORTS STUDIO",270,90);
ctx.font="900 48px Arial";const words=String(scene.text).split(" ");let lines=[],line="";for(const w of words){const test=line?line+" "+w:w;if(ctx.measureText(test).width>450){lines.push(line);line=w}else line=test}if(line)lines.push(line);const startY=450-(lines.length-1)*32;lines.forEach((l,n)=>ctx.fillText(l,270,startY+n*64));
ctx.fillStyle="rgba(255,255,255,.22)";ctx.fillRect(45,860,450,6);ctx.fillStyle="#fff";ctx.fillRect(45,860,450*((acc+local)/total),6);ctx.font="600 18px Arial";ctx.fillText(`${idx+1} / ${scenes.length}`,270,910);
if(elapsed<total)requestAnimationFrame(draw);else{rec.stop();stream.getTracks().forEach(t=>t.stop());}}
requestAnimationFrame(draw);const blob=await finished;if(audioCtx)await audioCtx.close();return URL.createObjectURL(blob)}
async function generate(){
if(running)return;running=true;const value=topic.value.trim();if(!value){topic.focus();running=false;return}
$("#generateBtn").disabled=true;$("#downloadBtn").disabled=true;$("#overallStatus").textContent="Generating…";$("#previewTitle").textContent=value.length>72?value.slice(0,69)+"…":value;resetStages();setStage(0,"active");
try{const base=apiBase();if(!base)throw new Error("Backend URL is not configured");const response=await fetch(base+"/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:value})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Generation failed");
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