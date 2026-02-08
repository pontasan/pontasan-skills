import { GeminiUtils } from "./gemini_utils.js"
import { Spec } from "./type.js"

async function main() {
    const arg = process.argv[2]
    if (!arg) {
        throw new Error("VIDEO_SPEC_JSON is missing")
    }

    let specList: Spec[] | undefined = undefined
    try {
        specList = JSON.parse(arg)
    } catch (err) {
        throw new Error("Failed to parse VIDEO_SPEC_JSON as JSON")
    }

    if (!specList) {
        throw new Error("VIDEO_SPEC_JSON is invalid")
    }

    for (const spec of specList) {
        if (!spec.filePath) {
            throw new Error("filePath is missing in VIDEO_SPEC_JSON")
        }

        if (!spec.prompt && !spec.imagePath) {
            throw new Error("Either prompt or imagePath must be provided in VIDEO_SPEC_JSON")
        }

        if (!spec.mode) {
            throw new Error("mode is missing in VIDEO_SPEC_JSON")
        }

        if (spec.mode !== 'fast' && spec.mode !== 'quality' && spec.mode !== 'ultra') {
            throw new Error("mode must be 'fast', 'quality', or 'ultra'")
        }

        if (spec.mimeType !== undefined && spec.mimeType !== 'video/mp4' && spec.mimeType !== 'image/gif') {
            throw new Error("mimeType must be 'video/mp4' or 'image/gif'")
        }

        if (spec.aspectRatio !== undefined && spec.aspectRatio !== '16:9' && spec.aspectRatio !== '9:16') {
            throw new Error("aspectRatio must be '16:9' or '9:16'")
        }

        // Validate durationSeconds against the model's allowed values
        const aiModel = GeminiUtils.getVideoModel(spec.mode)
        if (spec.durationSeconds !== undefined && !aiModel.durationSeconds.includes(spec.durationSeconds)) {
            throw new Error(`durationSeconds must be one of [${aiModel.durationSeconds.join(', ')}] for mode '${spec.mode}'`)
        }

        // Initialize
        const context = await GeminiUtils.loadLog()

        // Generate video and write to file
        console.warn(`Starting video generation`)
        const filePath = await GeminiUtils.runGenerateVideo(spec, context)

        // Output the generated file path to stdout
        console.log(filePath)
    }
}

await main()
process.exit(0)
