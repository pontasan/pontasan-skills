---
name: pontasan-genmov
description: AI video generation skill using Gemini Veo. Use this skill whenever you need to generate video content (MP4) from text prompts or images. Supports text-to-video and image-to-video generation.
---

## Usage

Based on the prompt content, determine the appropriate video to generate and run the following script.
The script generates a video according to your instruction (<VIDEO_SPEC_JSON>) and writes the generated video file path to standard output.
Retrieve the video file path from standard output and use it as part of your task.
.ts files can be executed directly by Node.js, so TypeScript compilation is not required.

```bash
# Set timeout to 600000ms (10 minutes) as video generation can take a long time
npm --prefix .claude/skills/pontasan-genmov/script run generate -- <VIDEO_SPEC_JSON>
```

## <VIDEO_SPEC_JSON> Description

VIDEO_SPEC_JSON must be a JSON array with the following fields:

[{
"filePath": "The expected output video file path (must be an absolute path, e.g. /path/to/output.mp4)",
"prompt": "The text prompt describing the video to generate (optional if imagePath is provided)",
"imagePath": "The absolute path to an input image for image-to-video generation (optional if prompt is provided)",
"mode": "fast or quality. fast: high speed generation (veo-3.1-fast). quality: slower but higher quality (veo-3.1). quality has strict usage limits, so use it only when high quality is truly needed. Default to fast in most cases.",
"mimeType": "The output MIME type (currently only video/mp4 is supported, defaults to video/mp4)",
"aspectRatio": "The aspect ratio of the video: '16:9' (landscape, default) or '9:16' (portrait)",
"durationSeconds": "Duration of the video in seconds. Supported values: 4, 6, or 8. Defaults to 4. To minimize file size, use 4 unless the user explicitly requests a longer duration.",
"generateAudio": "Whether to generate audio along with the video. Defaults to false. Only set to true when audio is explicitly required by the user. Keeping audio off reduces file size."
}]

- Either `prompt` or `imagePath` (or both) must be provided.
- When both `prompt` and `imagePath` are provided, the image is used as a starting frame and the prompt describes the desired motion/action.
- **Audio is off by default.** Do not enable `generateAudio` unless the user explicitly requests audio or sound in the video.
