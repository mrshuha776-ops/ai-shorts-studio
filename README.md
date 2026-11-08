# AI Shorts Studio

Mobile-first foundation for a universal AI Shorts production workflow.

## v1.0 — AI Director MVP

Topic → Director → Scene Plan → Voice → Visual Engine → Render.

The free-first visual engine uses cinematic browser motion graphics and optional provider-backed scene images. The app remains usable in offline demo mode when provider credentials are not configured.

## Current stage

- Topic input
- 6-stage production pipeline UI
- 9:16 preview
- Provider management UI
- Responsive mobile layout
- Structured six-scene Director contract
- Production Skills sent to backend
- MP4 MediaRecorder when supported, WebM fallback
- GitHub Pages deployment workflow
- Offline storyboard fallback when Gemini is unavailable
- Server-side rate limiting and CORS protection
- Optional ElevenLabs narration with timestamp alignment
- Supabase-backed resumable job records

## Pipeline

Topic → Research → Script → Voice → Visuals → Render

## Important

Real provider credentials are handled only server-side. The browser never receives API keys.

## Deploy

1. Deploy this repository to GitHub Pages using the included workflow.
2. Deploy the `/api` functions to Vercel.
3. Configure `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` (optional), `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `FRONTEND_ORIGIN` in Vercel.
4. Run `supabase/jobs.sql` once if persistent jobs are needed.
5. Set the Vercel URL in Settings → Backend URL when using a custom deployment.
