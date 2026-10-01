# AI Shorts Studio

Mobile-first foundation for a universal AI Shorts production workflow.

## v0.3 — AI Director foundation

Topic → Director → Scene Plan → Voice → Visual Engine → Render.

The free-first visual engine currently uses cinematic browser motion graphics. Provider-backed AI visuals are the next adapter, not a hard dependency.

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

## Pipeline

Topic → Research → Script → Voice → Visuals → Render

## Important

The current frontend is a prototype. API keys are **not** sent to an AI provider from this static site. Real provider credentials should be handled server-side in the next backend stage.

## Roadmap

1. Deploy the frontend
2. Add secure backend
3. Add research provider
4. Add script generation
5. Add voice provider
6. Add provider-backed visual generation
7. Add word-level captions
8. Add FFmpeg 1080×1920 render worker
9. Add persistent resumable jobs
7. Add render queue
8. Add job history and downloadable outputs
