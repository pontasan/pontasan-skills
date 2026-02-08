---
name: pontasan-genmov
description: AI video generation skill using Gemini Veo. Generates video (MP4/GIF) from text prompts or images. Ideal for creating animated versions of static images, as well as generating videos from text descriptions.
---

## Usage

Run the following script to generate a video. The generated file path is written to stdout.

```bash
# Set timeout to 600000ms (10 minutes) as video generation can take a long time
npm --prefix .claude/skills/pontasan-genmov/script run generate -- <VIDEO_SPEC_JSON>
```

## VIDEO_SPEC_JSON

JSON array format:

[{
"filePath": "Absolute output path (.mp4 or .gif)",
"prompt": "Text prompt (optional if imagePath provided)",
"imagePath": "Absolute path to input image (optional if prompt provided)",
"mode": "fast | quality | ultra",
"mimeType": "video/mp4 | image/gif",
"aspectRatio": "16:9 | 9:16",
"durationSeconds": "Number (valid values depend on mode)",
"generateAudio": "Boolean"
}]

## Rules

- Either `prompt` or `imagePath` (or both) must be provided.
- When both are provided, the image is the starting frame and the prompt describes the motion.
- **mode**: Always default to `fast`. Use `quality` or `ultra` only when explicitly requested.
- **mimeType**: Defaults to `video/mp4`. Use `image/gif` only when explicitly needed.
- **aspectRatio**: Defaults to `16:9`.
- **durationSeconds**: Allowed values differ by mode. fast=[5,6,7,8], quality/ultra=[4,6,8]. Defaults to the shortest (fast=5, quality/ultra=4). Always use the shortest unless explicitly requested longer. If a requested value is unavailable, use the nearest valid one.
- **generateAudio**: Defaults to `false`. Only enable when audio is explicitly requested.
