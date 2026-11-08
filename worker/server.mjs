import http from 'node:http';
import {mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const port = Number(process.env.PORT || 8080);
const root = process.env.JOB_DIR || '/data/jobs';
const token = String(process.env.WORKER_TOKEN || '');
await mkdir(root, {recursive: true});

const themes = {
  viral: {fontSize: 30, margin: 170, primary: '&H00FFFFFF', outline: 3, outlineColour: '&H00000000'},
  documentary: {fontSize: 22, margin: 150, primary: '&H00FFFFFF', outline: 2, outlineColour: '&H99000000'},
  minimal: {fontSize: 20, margin: 135, primary: '&H00FFFFFF', outline: 1, outlineColour: '&H66000000'}
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', ...headers});
  res.end(JSON.stringify(body));
}
function auth(req) {
  return !token || req.headers.authorization === `Bearer ${token}`;
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; if (raw.length > 8_000_000) reject(new Error('payload too large')); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    let stderr = '';
    child.stderr.on('data', x => { stderr += x.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-3000) || `ffmpeg exited ${code}`)));
  });
}
function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', x => { stdout += x.toString(); });
    child.stderr.on('data', x => { stderr += x.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr.slice(-2000) || `command exited ${code}`)));
  });
}
function flattenShots(payload) {
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  const shots = [];
  for (const [sceneIndex, scene] of scenes.entries()) {
    const values = Array.isArray(scene?.shots) && scene.shots.length ? scene.shots : [scene];
    for (const [shotIndex, shot] of values.entries()) {
      const duration = Math.max(0.7, Math.min(15, Number(shot?.duration || scene?.duration || 3)));
      shots.push({
        duration,
        text: String(shot?.text || scene?.text || '').trim().slice(0, 140),
        color: `hsl(${(sceneIndex * 67 + shotIndex * 31 + 215) % 360},72%,14%)`
      });
    }
  }
  return shots.length ? shots : [{duration: 3, text: String(payload.title || 'AI Shorts Studio').slice(0, 140), color: 'hsl(225,72%,14%)'}];
}
function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), x = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(x).padStart(3,'0')}`;
}
function makeSrt(shots) {
  let at = 0;
  return shots.map((shot, i) => {
    const start = at; at += shot.duration;
    return `${i + 1}\n${srtTime(start)} --> ${srtTime(at)}\n${shot.text}\n`;
  }).join('\n');
}
function makeWordSrt(payload, fallbackShots) {
  const alignment = payload.voiceAlignment, script = String(payload.script || '').trim();
  if (!alignment?.characters?.length || !alignment.character_start_times_seconds?.length || !script) return makeSrt(fallbackShots);
  const starts = alignment.character_start_times_seconds, ends = alignment.character_end_times_seconds || [], cues = [];
  const re = /\S+/g; let match;
  while ((match = re.exec(script))) {
    const startIndex = match.index, endIndex = Math.min(starts.length - 1, startIndex + match[0].length - 1);
    if (startIndex >= starts.length) continue;
    const start = Number(starts[startIndex]) || 0, end = Number(ends[endIndex] || starts[Math.min(starts.length - 1, endIndex + 1)] || start + .25);
    cues.push(`${cues.length + 1}\n${srtTime(start)} --> ${srtTime(Math.max(start + .12, end))}\n${match[0]}\n`);
  }
  return cues.length ? cues.join('\n') : makeSrt(fallbackShots);
}
function colorForFilter(color) {
  const match = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/.exec(color);
  if (!match) return '0x111827';
  const h = Number(match[1]) / 60, s = Number(match[2]) / 100, l = Number(match[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `0x${[r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
async function render(payload) {
  const id = randomUUID();
  const dir = join(root, id);
  await mkdir(dir, {recursive: true});
  const shots = flattenShots(payload);
  const srt = join(dir, 'captions.srt');
  const output = join(dir, 'short.mp4');
  await writeFile(srt, makeWordSrt(payload, shots), 'utf8');
  const inputs = [];
  for (const shot of shots) inputs.push('-f', 'lavfi', '-i', `color=c=${colorForFilter(shot.color)}:s=1080x1920:r=30:d=${shot.duration}`);
  const labels = shots.map((_, i) => `[${i}:v]`).join('');
  const theme = themes[payload.captionTheme] || themes.viral;
  const style = `FontName=Arial,FontSize=${theme.fontSize},PrimaryColour=${theme.primary},OutlineColour=${theme.outlineColour},Outline=${theme.outline},Alignment=2,MarginV=${theme.margin}`;
  const filter = `${labels}concat=n=${shots.length}:v=1:a=0[v0];[v0]subtitles=${srt}:force_style='${style}'[v]`;
  const args = [...inputs];
  if (payload.audioBase64) {
    const audio = join(dir, 'voice.mp3');
    await writeFile(audio, Buffer.from(String(payload.audioBase64), 'base64'));
    args.push('-i', audio);
    args.push('-filter_complex', filter, '-map', '[v]', '-map', `${shots.length}:a:0`, '-c:a', 'aac', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-shortest');
  } else {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    args.push('-filter_complex', filter, '-map', '[v]', '-map', `${shots.length}:a:0`, '-t', String(shots.reduce((a, x) => a + x.duration, 0)), '-c:a', 'aac');
  }
  args.push('-c:v', 'libx264', '-preset', process.env.FFMPEG_PRESET || 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output);
  await run('ffmpeg', ['-y', ...args]);
  const probe = JSON.parse(await capture('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', output]));
  const streams = probe.streams || [], video = streams.find(x => x.codec_type === 'video'), audioStream = streams.find(x => x.codec_type === 'audio');
  const quality = {passed: Boolean(video && video.width === 1080 && video.height === 1920 && audioStream), checks: {vertical1080: Boolean(video && video.width === 1080 && video.height === 1920), audioPresent: Boolean(audioStream), durationSeconds: Number(probe.format?.duration || 0)}};
  if (!quality.passed) throw new Error(`quality gate failed: ${JSON.stringify(quality.checks)}`);
  return {id, output, duration: shots.reduce((a, x) => a + x.duration, 0), shotCount: shots.length, quality};
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health' && req.method === 'GET') return send(res, 200, {ok: true, service: 'ai-shorts-render-worker'});
    if (!auth(req)) return send(res, 401, {error: 'unauthorized'});
    if (req.url === '/render' && req.method === 'POST') {
      const payload = await body(req);
      if (!Array.isArray(payload.scenes) && !payload.title) return send(res, 400, {error: 'scenes or title is required'});
      const result = await render(payload);
      return send(res, 201, {ok: true, jobId: result.id, status: 'ready', artifact: `/artifacts/${result.id}.mp4`, duration: result.duration, shotCount: result.shotCount, quality: result.quality});
    }
    const match = /^\/artifacts\/([a-f0-9-]+)\.mp4$/.exec(req.url || '');
    if (match && req.method === 'GET') {
      const file = join(root, match[1], 'short.mp4');
      if (!existsSync(file)) return send(res, 404, {error: 'artifact not found'});
      const data = await readFile(file);
      res.writeHead(200, {'content-type': 'video/mp4', 'content-length': data.length, 'cache-control': 'private, max-age=3600'});
      return res.end(data);
    }
    if (req.url?.startsWith('/jobs/') && req.method === 'DELETE') {
      const id = req.url.split('/').pop(); await rm(join(root, id), {recursive: true, force: true});
      return send(res, 200, {ok: true, status: 'deleted'});
    }
    return send(res, 404, {error: 'not found'});
  } catch (error) { return send(res, 500, {error: error.message || 'render failed'}); }
});
server.listen(port, () => console.log(`AI Shorts render worker listening on :${port}`));
