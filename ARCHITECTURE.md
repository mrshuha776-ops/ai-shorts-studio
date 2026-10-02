# AI Shorts Studio — v0.3 Architecture

## Pipeline

Topic → Director → Research/Script → Scene Plan → Voice → Visual Engine → Render → Validate → Publish

## Director contract

The backend returns an adaptive set of normalized scenes (typically 6–30). Each scene carries:
- text
- duration
- visualPrompt
- effect

This contract lets us add image, stock-video or AI-video providers without rebuilding the UI.

## Current product direction

The main page is a focused creation workspace: topic, language, duration, visual style, progress, preview and export. Provider names, routing and advanced skills belong behind Settings/Advanced. Browser Canvas remains a fast storyboard/fallback renderer; it is not the long-term production export engine.

## Production target

Topic → Research → Fact Check → Script → Voice → Alignment → Visual Assets → Master Timeline → Render → Quality Check → Preview/Download.

Voice timing is the source of truth for final shot and caption timing. Long-running work should eventually use a persisted job record and resumable stages rather than one browser request. Asset files should live in object storage; the final MP4 should be rendered by a dedicated worker when production export is introduced.

## Free-first rule

The current renderer is a browser fallback using motion graphics. Real AI visuals are an adapter to add next. API secrets stay server-side.

## Next upgrades

1. Provider-backed AI images per scene
2. Persisted job/status model
3. Research + source/fact-check layer
4. Word-level captions with speech timestamps
5. FFmpeg 1080×1920 MP4 render worker
6. Persistent resumable jobs
7. Asset storage using URLs instead of large base64 payloads
8. Provider fallback chain
9. YouTube export/publishing

## Reference patterns

PurffleShorts demonstrates provider fallback, word-synced captions and FFmpeg rendering. Kalinga demonstrates inspectable, resumable stages and channel-specific direction. AI Shorts Studio uses these as architectural references rather than copying their implementation.


## Quality system — Director v1

The production unit is not a scene; it is a **beat**. A beat is a narration phrase + semantic visual + caption + timing + transition.

### Master timeline
Voice timing is the source of truth when timestamp alignment is available. ElevenLabs can return character timing with TTS, and its Forced Alignment API can produce word-level timing for an existing audio file. The renderer should derive caption and shot boundaries from this timing rather than guessing fixed durations.

### Beat quality rules
1. Every beat must answer: **what is being said, what should be shown, and why now?**
2. Do not change shots merely because a fixed timer expired.
3. Prefer a new visual at semantic changes, reveals, claims, reactions, questions, or pattern interrupts.
4. Avoid consecutive shots with the same composition, camera motion, or visual subject unless continuity is intentional.
5. Hook beats receive the strongest visual contrast and clearest caption.
6. Important nouns, numbers, locations, objects, and actions should have a concrete visual whenever practical.
7. Captions must be readable, short, and synchronized to speech; emphasis should follow the spoken phrase.
8. Do not let visual changes outrun comprehension. Fast cuts are allowed only when the narration remains understandable.
9. The final 1–2 seconds should resolve the promise or create a natural loop/CTA without adding unrelated information.
10. If a generated visual does not clearly support the narration, the validator should flag it for regeneration.

### Quality gates
- **Script gate:** hook clarity, factual structure, no filler, coherent payoff.
- **Voice gate:** duration, intelligibility, natural pacing, alignment availability.
- **Visual gate:** semantic relevance, diversity, continuity, safe text area.
- **Sync gate:** shot/caption boundaries follow narration timing.
- **Retention gate:** inspect opening, pattern interrupts, dead-air/low-information intervals, and ending.
- **Render gate:** 9:16, stable frame rate, audio present, no blank frames, export format supported by the target runtime.

### Target for a 45-second Short
Use approximately 18–30 visual cuts as a starting range, but let the Director adapt the count to information density. This is a design heuristic, not a guaranteed retention formula. YouTube itself reports that Shorts performance is informed by chose-to-view, average view duration, and average percentage viewed, so the system should learn from actual channel analytics rather than assume a universal cut frequency.
