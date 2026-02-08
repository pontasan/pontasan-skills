---
name: pontasan-genimg
description: AI image generation skill. Proactively use this skill whenever you need to create new image resources (JPEG, PNG, SVG, etc.) such as icons, illustrations, backgrounds, logos, or banners while implementing frontend code (HTML/CSS/TSX). When a required image asset is missing or does not yet exist, invoke this skill on your own initiative without waiting for explicit user instructions.
---

## Usage

Based on the prompt content, determine the appropriate image to generate and run the following script.
The script generates an image according to your instruction (<IMAGE_SPEC_JSON>) and writes the generated image file path to standard output.
Retrieve the image file path from standard output and use it as part of your task.
.ts files can be executed directly by Node.js, so TypeScript compilation is not required.

```bash
# Set timeout to 600000ms (10 minutes) as image generation can take a long time
npm --prefix .claude/skills/pontasan-genimg/script run generate -- <IMAGE_SPEC_JSON>
```

## <IMAGE_SPEC_JSON> Description

IMAGE_SPEC_JSON must be a JSON object with the following fields:

[{
"filePath": "The expected output image file path (must be an absolute path)",
"mime": "The MIME type of the image",
"prompt": "The prompt used to generate the image",
"mode": "fast or quality. fast: high speed generation. quality: slower but higher quality. quality has strict usage limits, so use it only when high quality is truly needed. Default to fast in most cases."
}]

