import { GoogleGenAI } from '@google/genai';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { setTimeout } from 'timers/promises';
import { promisify } from 'util';
import { AiModel, Context, newContext, newRequestHistory, RequestHistory, Spec } from './type.js';

const execFileAsync = promisify(execFile);

export namespace GeminiUtils {
    const SAFETY_FACTOR = 0.95 // Safety margin
    const LOG_DIR = '.logs'
    const POLL_INTERVAL_MS = 10_000 // 10 seconds
    const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
    const RETRY_LIMIT = 3

    let ffmpegAvailable: boolean | undefined = undefined

    export function getVideoModel(mode: 'fast' | 'quality'): AiModel {
        switch (mode) {
            case 'fast': return {
                model: 'veo-3.1-fast-generate-preview',
                rpm: Math.trunc(5 * SAFETY_FACTOR),
                tpm: Math.trunc(100 * 1000 * SAFETY_FACTOR),
                rpd: Math.trunc(50 * SAFETY_FACTOR)
            }
            case 'quality': return {
                model: 'veo-3.1-generate-preview',
                rpm: Math.trunc(5 * SAFETY_FACTOR),
                tpm: Math.trunc(100 * 1000 * SAFETY_FACTOR),
                rpd: Math.trunc(25 * SAFETY_FACTOR)
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

    export async function runGenerateVideo(spec: Spec, context: Context): Promise<string> {
        if (!spec.prompt && !spec.imagePath) {
            throw new Error("Either prompt or imagePath must be provided in spec")
        }
        if (!spec.filePath) {
            throw new Error("File path is missing in spec")
        }

        context.aiModel = getVideoModel(spec.mode)
        return await generateVideo(spec, context)
    }

    async function generateVideo(spec: Spec, context: Context): Promise<string> {
        if (!context.aiModel) {
            throw new Error("AI model is not set in context")
        }

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not set")
        }

        const ai = new GoogleGenAI({ apiKey })

        console.warn(`Using AI model: ${context.aiModel.model}`)

        // Build request parameters (invariant across retries)
        const params: {
            model: string,
            prompt?: string,
            image?: { imageBytes: string, mimeType: string },
            config?: { aspectRatio?: string, durationSeconds?: number }
        } = {
            model: context.aiModel.model,
            config: {
                aspectRatio: spec.aspectRatio ?? "16:9",
                durationSeconds: spec.durationSeconds ?? 4
            }
        }

        if (spec.prompt) {
            params.prompt = spec.prompt
        }

        // Load image if provided (image-to-video)
        if (spec.imagePath) {
            const imageBuffer = await fs.readFile(spec.imagePath)
            const base64Data = imageBuffer.toString('base64')
            const ext = path.extname(spec.imagePath).toLowerCase()
            const imageMime = ext === '.png' ? 'image/png'
                : ext === '.webp' ? 'image/webp'
                    : ext === '.gif' ? 'image/gif'
                        : 'image/jpeg'

            params.image = {
                imageBytes: base64Data,
                mimeType: imageMime
            }
            console.warn(`Input image loaded: ${spec.imagePath} (${imageMime})`)
        }

        await writeDebugFile(JSON.stringify(spec, null, 2), 'spec.json')

        for (let i = 0; i < RETRY_LIMIT; i++) {
            try {
                await waitForRateLimit(context)

                const promptLength = (spec.prompt?.length ?? 0) + (spec.imagePath ? 1000 : 0)
                const log = newRequestHistory(context.aiModel.model, promptLength)
                await writeLog(log, context)

                console.warn(`Calling API... attempt=${i + 1}`)

                // Start video generation
                let operation = await ai.models.generateVideos(params)

                console.warn(`Video generation started, polling for completion...`)
                if (operation.name) {
                    console.warn(`Operation name: ${operation.name}`)
                }

                // Poll until done (with timeout)
                const pollStart = Date.now()
                while (!operation.done) {
                    if (Date.now() - pollStart >= POLL_TIMEOUT_MS) {
                        throw new Error(`Video generation timed out after ${POLL_TIMEOUT_MS / 1000} seconds`)
                    }
                    await setTimeout(POLL_INTERVAL_MS)
                    console.warn(`Polling... (elapsed=${Math.round((Date.now() - pollStart) / 1000)}s)`)
                    operation = await ai.operations.getVideosOperation({ operation })
                }

                console.warn(`Video generation completed`)

                // Check for errors
                if (operation.error) {
                    throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`)
                }

                if (!operation.response) {
                    throw new Error("Video generation response is undefined")
                }

                const generatedVideos = operation.response.generatedVideos
                if (!generatedVideos || generatedVideos.length === 0) {
                    throw new Error("No videos were generated")
                }

                const video = generatedVideos[0].video
                if (!video) {
                    throw new Error("Generated video data is undefined")
                }

                await writeDebugFile(JSON.stringify({
                    uri: video.uri,
                    mimeType: video.mimeType,
                    raiMediaFilteredCount: operation.response.raiMediaFilteredCount,
                    raiMediaFilteredReasons: operation.response.raiMediaFilteredReasons
                }, null, 2), 'output_info.json')

                if (!video.uri) {
                    throw new Error("Video URI is missing in the response")
                }

                // Download video to output path
                const filePath = spec.filePath!
                const dir = path.dirname(filePath)
                await fs.mkdir(dir, { recursive: true })

                console.warn(`Downloading video to: ${filePath}`)
                await ai.files.download({
                    file: generatedVideos[0],
                    downloadPath: filePath
                })

                // Strip audio if not requested
                if (!spec.generateAudio) {
                    await stripAudio(filePath)
                }

                return filePath
            } catch (e) {
                console.error(e)
                if (i === RETRY_LIMIT - 1) {
                    throw new Error(`Failed to generate video after ${RETRY_LIMIT} attempts`)
                }
                console.warn(`Retrying... (${i + 1}/${RETRY_LIMIT})`)
            }
        }

        throw new Error("Failed to generate video after multiple attempts")
    }

    async function stripAudio(filePath: string) {
        // Check if ffmpeg is available (cached)
        if (ffmpegAvailable === undefined) {
            try {
                await execFileAsync('ffmpeg', ['-version'])
                ffmpegAvailable = true
            } catch {
                ffmpegAvailable = false
            }
        }
        if (!ffmpegAvailable) {
            console.warn('ffmpeg not found, skipping audio removal. Install ffmpeg to enable automatic audio stripping.')
            return
        }

        const tmpPath = filePath + '.with_audio.mp4'
        await fs.rename(filePath, tmpPath)
        try {
            console.warn(`Stripping audio from video...`)
            await execFileAsync('ffmpeg', ['-i', tmpPath, '-an', '-c:v', 'copy', '-y', filePath])
            await fs.unlink(tmpPath)
            console.warn(`Audio stripped successfully`)
        } catch (e) {
            console.warn(`Failed to strip audio, keeping original: ${e}`)
            // Restore original file
            await fs.rename(tmpPath, filePath)
        }
    }
}
