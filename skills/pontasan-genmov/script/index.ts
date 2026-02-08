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

        if (spec.mode !== 'fast' && spec.mode !== 'quality') {
            throw new Error("mode must be 'fast' or 'quality'")
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
