export type Context = {
    requestLogs: RequestHistory[],
    aiModel?: AiModel
}

export function newContext(): Context {
    return {
        requestLogs: []
    }
}

export type RequestHistory = {
    key: string,
    time: number,
    aiModel: string,
    promptLength: number,
    promptTokenCount?: number,
    candidatesTokenCount?: number,
    totalTokenCount?: number,
    cachedContentTokenCount?: number
}
export function newRequestHistory(aiModelName: string, promptLength: number): RequestHistory {
    const time = Date.now()
    return {
        key: `${crypto.randomUUID()}_${time}.json`,
        time: time,
        aiModel: aiModelName,
        promptLength
    }
}

export type Spec = {
    filePath?: string,
    prompt?: string,
    imagePath?: string,
    mode: 'fast' | 'quality' | 'ultra',
    mimeType?: string,
    aspectRatio?: string,
    durationSeconds?: number,
    generateAudio?: boolean
}

export type AiModel = {
    model: string,
    rpm: number,
    rpd: number,
    durationSeconds: number[]
}
