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

export type GenerationResult = {
    filePath: string,
    data: string,
    mime: string,
    check: boolean
}
export function newGenerationResult(): GenerationResult {
    return {
        filePath: '',
        data: '',
        mime: '',
        check: false
    }
}

export type Spec = {
    filePath?: string,
    mime?: string,
    prompt?: string,
    mode: 'fast' | 'quality'
}

export type AiModel = {
    model: string,
    rpm: number,
    tpm: number,
    rpd: number
}
