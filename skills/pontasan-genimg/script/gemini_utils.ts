import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SchemaType } from '@google/generative-ai/server';
import fs from 'fs/promises';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { AiModel, Context, GenerationResult, newContext, newGenerationResult, newRequestHistory, RequestHistory, Spec } from './type.js';

export namespace GeminiUtils {
    const SAFETY_FACTOR = 0.95 // Safety margin
    const LOG_DIR = '.logs'

    export function getTextModel(mode: 'fast' | 'quality'): AiModel {
        switch (mode) {
            case 'fast': return {
                model: 'gemini-3-flash-preview',
                rpm: Math.trunc(1000 * SAFETY_FACTOR),
                tpm: Math.trunc(1000 * 1000 * SAFETY_FACTOR),
                rpd: Math.trunc(10 * 1000 * SAFETY_FACTOR)
            }
            case 'quality': return {
                model: 'gemini-3-pro-preview',
                rpm: Math.trunc(25 * SAFETY_FACTOR),
                tpm: Math.trunc(1000 * 1000 * SAFETY_FACTOR),
                rpd: Math.trunc(250 * SAFETY_FACTOR)
            }
        }
    }

    export function getImageModel(mode: 'fast' | 'quality'): AiModel {
        switch (mode) {
            case 'fast': return {
                model: 'gemini-2.5-flash-image',
                rpm: Math.trunc(500 * SAFETY_FACTOR),
                tpm: Math.trunc(500 * 1000 * SAFETY_FACTOR),
                rpd: Math.trunc(2 * 1000 * SAFETY_FACTOR)
            }
            case 'quality': return {
                model: 'gemini-3-pro-image-preview',
                rpm: Math.trunc(20 * SAFETY_FACTOR),
                tpm: Math.trunc(100 * 1000 * SAFETY_FACTOR),
                rpd: Math.trunc(250 * SAFETY_FACTOR)
            }
        }
    }

    export async function exists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath)
            return true
        } catch (e) {
            return false
        }
    }

    export async function writeLog(log: RequestHistory, context: Context) {
        if (!await exists(LOG_DIR)) {
            await fs.mkdir(LOG_DIR, { recursive: true })
        }

        context.requestLogs.push(log)
        await fs.writeFile(
            path.join(LOG_DIR, 'wal.json'),
            Buffer.from(JSON.stringify(context.requestLogs))
        )
    }

    export async function loadLog(): Promise<Context> {
        const context = newContext()

        if (!await exists(LOG_DIR)) {
            await fs.mkdir(LOG_DIR, { recursive: true })
        }

        const walPath = path.join(LOG_DIR, 'wal.json')
        try {
            const data = await fs.readFile(walPath)
            const json: RequestHistory[] = JSON.parse(Buffer.from(data).toString('utf8'))
            if (!Array.isArray(json)) {
                throw new Error("Log file is not an array")
            }
            context.requestLogs = json
            return context
        } catch (e) {
            // Initialize if WAL file is missing or corrupted
            console.warn("Initializing log file")
            await init()
            context.requestLogs = []
            return context
        }
    }

    export async function writeDebugFile(content: string, fileName: string) {
        if (!await exists(LOG_DIR)) {
            await fs.mkdir(LOG_DIR, { recursive: true })
        }

        await fs.writeFile(
            path.join(LOG_DIR, fileName),
            Buffer.from(content)
        )
    }

    async function init() {
        if (!await exists(LOG_DIR)) {
            await fs.mkdir(LOG_DIR, { recursive: true })
        }

        await fs.writeFile(
            path.join(LOG_DIR, 'wal.json'),
            Buffer.from(JSON.stringify([]))
        )
    }

    async function waitForRateLimit(context: Context) {
        const ONE_MINUTE_MS = 1000 * 60
        const ONE_DAY_MS = 1000 * 60 * 60 * 24

        if (!context.aiModel) {
            throw new Error("AI model is not set in context")
        }

        while (true) {
            const currentTime = Date.now()
            let rpmCount = 0
            let rpdCount = 0
            let tpmCount = 0
            for (const log of context.requestLogs) {
                if (log.aiModel !== context.aiModel.model) {
                    continue
                }

                if (currentTime - log.time <= ONE_MINUTE_MS) {
                    rpmCount++

                    const tokenSize = (log.totalTokenCount !== undefined ? log.totalTokenCount : log.promptLength)
                    tpmCount += tokenSize
                }
                if (currentTime - log.time <= ONE_DAY_MS) {
                    rpdCount++
                }
            }

            // RPM/RPD/TPM check
            let rpmExceeded = false
            let rpdExceeded = false
            let tpmExceeded = false
            if (rpmCount >= context.aiModel.rpm) {
                rpmExceeded = true
                console.warn(`RPM limit exceeded: ${rpmCount} >= ${context.aiModel.rpm}`)
            }
            if (rpdCount >= context.aiModel.rpd) {
                rpdExceeded = true
                console.warn(`RPD limit exceeded: ${rpdCount} >= ${context.aiModel.rpd}`)
            }
            if (tpmCount >= context.aiModel.tpm) {
                tpmExceeded = true
                console.warn(`TPM limit exceeded: ${tpmCount} >= ${context.aiModel.tpm}`)
            }

            console.warn(`RPM remaining=${context.aiModel.rpm - rpmCount} / RPD remaining=${context.aiModel.rpd - rpdCount} / TPM remaining=${context.aiModel.tpm - tpmCount}`)

            if (rpmExceeded || rpdExceeded || tpmExceeded) {
                console.warn('Waiting for rate limit reset...')
                await setTimeout(ONE_MINUTE_MS)
                continue
            }

            break
        }
    }

    export async function runGenerateImage(spec: Spec, context: Context): Promise<GenerationResult> {
        if (!spec.prompt) {
            throw new Error("Prompt is missing in spec")
        }
        if (!spec.mime) {
            throw new Error("MIME type is missing in spec")
        }
        if (!spec.filePath) {
            throw new Error("File path is missing in spec")
        }

        let result: GenerationResult | undefined = undefined
        if (spec.mime.toLowerCase().indexOf('svg') >= 0) {
            // SVG
            const prompt = GeminiUtils.buildSvgPrompt({
                instructions: spec.prompt,
                filePath: spec.filePath,
                mime: spec.mime
            })
            console.warn(`Prompt built:\n${prompt}`)

            context.aiModel = getTextModel(spec.mode)
            result = await generateSvg(prompt, context)
        } else {
            // Binary image
            const prompt = GeminiUtils.buildImagePrompt({
                instructions: spec.prompt,
                filePath: spec.filePath,
                mime: spec.mime
            })
            console.warn(`Prompt built:\n${prompt}`)

            context.aiModel = getImageModel(spec.mode)
            result = await generateBinaryImage(prompt, spec, context)
        }

        if (!result) {
            throw new Error("Generation result is undefined")
        }

        return result
    }

    async function generateSvg(prompt: string, context: Context): Promise<GenerationResult> {
        if (!context.aiModel) {
            throw new Error("AI model is not set in context")
        }

        console.warn(`Using AI model: ${context.aiModel.model}`)

        const RETRY_LIMIT = 3
        for (let i = 0; i < RETRY_LIMIT; i++) {
            try {
                await waitForRateLimit(context)

                const log = newRequestHistory(context.aiModel.model, prompt.length)
                await writeLog(log, context)

                const apiKey = process.env.GEMINI_API_KEY
                if (!apiKey) {
                    throw new Error("GEMINI_API_KEY is not set")
                }

                const genAI = new GoogleGenerativeAI(apiKey)
                const model = genAI.getGenerativeModel({
                    model: context.aiModel.model,
                    generationConfig: {
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: SchemaType.OBJECT,
                            properties: {
                                filePath: { type: SchemaType.STRING, description: 'The output file path' },
                                data: { type: SchemaType.STRING, description: 'The complete generated file content without any omissions' },
                                mime: { type: SchemaType.STRING, description: 'The MIME type of the generated file' },
                                check: { type: SchemaType.BOOLEAN, description: 'true if the prompt instructions were followed, false otherwise' }
                            },
                            required: [
                                'filePath',
                                'data',
                                'mime',
                                'check'
                            ]
                        }
                    }
                })

                console.warn(`Calling API... attempt=${i + 1}`)
                await writeDebugFile(prompt, 'prompt.txt')
                const apiResult = await model.generateContent(prompt)

                console.warn(`API call succeeded, parsing response...`)
                const jsonText = apiResult.response.text()
                await writeDebugFile(jsonText, 'output.json')

                const normalizedText = normalizeJsonText(jsonText)
                await writeDebugFile(normalizedText, 'output_norm.json')

                const result: GenerationResult | undefined = JSON.parse(normalizedText)

                if (!result) {
                    throw new Error("Generation result is undefined")
                }

                // Validation
                if (!result.filePath) {
                    throw new Error("filePath is missing in generation result")
                }
                if (!result.data) {
                    throw new Error("data is missing in generation result")
                }
                if (!result.mime) {
                    throw new Error("mime is missing in generation result")
                }
                if (result.check === undefined || result.check === null) {
                    throw new Error("check is missing in generation result")
                }
                if (result.check === false) {
                    throw new Error("AI determined that the prompt instructions were not followed (check=false)")
                }

                return result
            } catch (e) {
                // retry
                console.error(e)
            }
        }

        throw new Error("Failed to generate SVG after multiple attempts")
    }

    async function generateBinaryImage(prompt: string, spec: Spec, context: Context) {
        if (!context.aiModel) {
            throw new Error("AI model is not set in context")
        }

        console.warn(`Using AI model: ${context.aiModel.model}`)

        const RETRY_LIMIT = 3
        for (let i = 0; i < RETRY_LIMIT; i++) {
            try {
                await waitForRateLimit(context)

                const log = newRequestHistory(context.aiModel.model, prompt.length)
                await writeLog(log, context)

                const apiKey = process.env.GEMINI_API_KEY
                if (!apiKey) {
                    throw new Error("GEMINI_API_KEY is not set")
                }

                console.warn(`Calling API... attempt=${i + 1}`)
                await writeDebugFile(prompt, 'prompt.txt')

                const genAI = new GoogleGenAI({ apiKey })
                const response = await genAI.models.generateContent({
                    model: context.aiModel.model,
                    contents: prompt
                })

                if (!response) {
                    throw new Error("Response is undefined")
                }
                if (!response.candidates) {
                    throw new Error("Response candidates are undefined")
                }

                console.warn(`API call succeeded, parsing response...`)

                let result: GenerationResult | undefined = undefined
                for (const candidate of response.candidates) {
                    if (!candidate.content) {
                        continue
                    }
                    if (!candidate.content.parts) {
                        continue
                    }

                    for (const part of candidate.content.parts) {
                        if (part.inlineData) {
                            result = newGenerationResult()
                            result.filePath = spec.filePath!
                            result.data = part.inlineData.data!
                            result.mime = part.inlineData.mimeType!
                            result.check = true
                            break
                        }
                    }

                    if (result) {
                        break
                    }
                }

                if (response.data) {
                    await writeDebugFile(String(response.data), 'output.json')
                }

                if (!result) {
                    throw new Error("Generation result is undefined")
                }

                return result
            } catch (e) {
                // retry
                console.error(e)
            }
        }

        throw new Error("Failed to generate binary image after multiple attempts")
    }

    export async function applyResults(result: GenerationResult) {
        if (!result.mime) {
            throw new Error("MIME type is missing in generation result")
        }
        if (!result.filePath) {
            throw new Error("File path is missing in generation result")
        }
        if (!result.check) {
            throw new Error("Validation check failed in generation result")
        }

        // Create directories if they don't exist
        const dir = path.dirname(result.filePath)
        await fs.mkdir(dir, { recursive: true })

        result.mime = result.mime.toLowerCase()

        const isText = result.mime.startsWith('image/svg') ||
            result.mime.startsWith('text/') ||
            result.mime.startsWith('application/javascript') ||
            result.mime.startsWith('application/x-typescript') ||
            result.mime.startsWith('application/json')

        if (isText) {
            // Text
            console.warn(`Writing file as text: ${result.filePath}`)
            await fs.writeFile(result.filePath, result.data, 'utf-8')
        } else {
            // Binary
            console.warn(`Writing file as binary: ${result.filePath}`)
            const buffer = Buffer.from(result.data, "base64")
            await fs.writeFile(result.filePath, buffer)
        }
    }

    function normalizeJsonText(text: string) {
        if (!text) {
            return ''
        }

        // Parser that fixes escaping only within JSON string values
        let parsingState = 0 // 0: outside string, 1: inside string
        let buf = ''
        let output = ''
        for (let i = 0; i < text.length; i++) {
            if (parsingState === 0) {
                // Only double quotes delimit strings in JSON
                if (text.charAt(i) === '"') {
                    parsingState = 1
                    output += text.charAt(i)
                    continue
                }
            } else if (parsingState === 1) {
                if (text.charAt(i) === '"' && text.charAt(i - 1) !== '\\') {
                    // Fix escaping within string values
                    buf = buf.replaceAll('\\`', '`')
                    buf = buf.replaceAll('\\$', '$')
                    buf = buf.replaceAll('\r\n', '\\n').replaceAll('\n', '\\n').replaceAll('\t', '\\t')

                    output += buf
                    output += text.charAt(i)

                    buf = ''
                    parsingState = 0
                    continue
                }

                buf += text.charAt(i)
                continue
            }

            output += text.charAt(i)
        }

        return output
    }

    export function buildSvgPrompt(args: {
        instructions: string,
        filePath: string,
        mime: string
    }) {
        return `
# Role
You are a skilled graphic designer and web designer. Generate an SVG based on the following information.

# Output File Path
${args.filePath}

# Output Image MIME Type
${args.mime}

# Prerequisites
- Follow the instructions exactly. Do not make unrelated changes.

# Important: Output Rules
- **No omissions are allowed**. You must output the **complete file content from beginning to end**.

# Result Format
Output in the following JSON format.
{
    "filePath": "The output file path",
    "data": "The complete generated file content without any omissions",
    "mime": "The MIME type of the generated file",
    "check": "true if the prompt instructions were followed, false otherwise"
}

# Instructions
${args.instructions}

`
    }

    export function buildImagePrompt(args: {
        instructions: string,
        filePath: string,
        mime: string
    }) {
        return `
# Role
You are a skilled graphic designer and web designer. Generate an image based on the following information.

# Output File Path
${args.filePath}

# Output Image MIME Type
${args.mime}

# Prerequisites
- Follow the instructions exactly. Do not make unrelated changes.

# Instructions
${args.instructions}

`
    }
}
