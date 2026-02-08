import { GeminiUtils } from "./gemini_utils.js"
import { Spec } from "./type.js"

async function main() {
    const arg = process.argv[2]
    if (!arg) {
        throw new Error("IMAGE_SPEC_JSON is missing")
    }

    let specList: Spec[] | undefined = undefined
    try {
        specList = JSON.parse(arg)
    } catch (err) {
        throw new Error("Failed to parse IMAGE_SPEC_JSON as JSON")
    }

    if (!specList) {
        throw new Error("IMAGE_SPEC_JSON is invalid")
    }

    for (const spec of specList) {
        if (!spec.filePath) {
            throw new Error("filePath is missing in IMAGE_SPEC_JSON")
        }

        if (!spec.mime) {
            throw new Error("mime is missing in IMAGE_SPEC_JSON")
        }

        if (!spec.prompt) {
            throw new Error("prompt is missing in IMAGE_SPEC_JSON")
        }

        if (!spec.mode) {
            throw new Error("mode is missing in IMAGE_SPEC_JSON")
        }

        if (spec.mode !== 'fast' && spec.mode !== 'quality') {
            throw new Error("mode must be 'fast' or 'quality'")
        }

        // Initialize
        const context = await GeminiUtils.loadLog()

        // Generate image
        console.warn(`Starting image generation`)
        const result = await GeminiUtils.runGenerateImage(spec, context)
        if (!result) {
            throw new Error("Failed to generate image")
        }

        // Write output to file
        console.warn(`Writing output to file`)
        await GeminiUtils.applyResults(result)

        // Output the generated file path to stdout
        console.log(result.filePath)
    }
}

await main()
process.exit(0)
