# AI Shorts Studio — v0.3 Architecture

## Pipeline

Topic → Director → Research/Script → Scene Plan → Voice → Visual Engine → Render → Validate → Publish

## Director contract

The backend returns six normalized scenes. Each scene carries:
- text
- duration
- visualPrompt
- effect

This contract lets us add image, stock-video or AI-video providers without rebuilding the UI.

## Free-first rule

The current renderer is a browser fallback using motion graphics. Real AI visuals are an adapter to add next. API secrets stay server-side.

## Next upgrades

1. Provider-backed AI images per scene
2. Word-level captions with speech timestamps
3. FFmpeg 1080×1920 MP4 render worker
4. Persistent resumable jobs
5. Asset storage using URLs instead of large base64 payloads
6. Provider fallback chain
7. YouTube export/publishing

## Reference patterns

PurffleShorts demonstrates provider fallback, word-synced captions and FFmpeg rendering. Kalinga demonstrates inspectable, resumable stages and channel-specific direction. AI Shorts Studio uses these as architectural references rather than copying their implementation.
