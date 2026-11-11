import { ApiError } from '../lib/errors.js';

export interface AiMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  /** Ask the model for a JSON document. The caller still validates it. */
  json?: boolean;
  maxTokens?: number;
}

/** The only thing the API needs from an LLM. Tests inject a fake. */
export interface AiClient {
  enabled: boolean;
  generate(req: AiRequest): Promise<string>;
}

interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Google Gemini over plain REST, so no SDK is needed. The key is only ever sent in a header. */
export function createGeminiClient(o: GeminiOptions): AiClient {
  const doFetch = o.fetchImpl ?? fetch;
  return {
    enabled: Boolean(o.apiKey),
    async generate(req) {
      if (!o.apiKey) throw new ApiError(503, 'ai_unavailable', 'The AI assistant is not switched on for this deployment.');
      let res: Response;
      try {
        res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': o.apiKey },
          signal: AbortSignal.timeout(o.timeoutMs ?? 25_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
            generationConfig: {
              temperature: req.json ? 0.2 : 0.5,
              maxOutputTokens: req.maxTokens ?? 700,
              ...(req.json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        });
      } catch {
        throw new ApiError(503, 'ai_unavailable', 'The AI assistant could not be reached. Try again in a moment.');
      }
      if (res.status === 429) throw new ApiError(503, 'ai_busy', 'The AI assistant is busy right now. Try again in a minute.');
      if (!res.ok) throw new ApiError(503, 'ai_unavailable', 'The AI assistant is not available right now.');
      const json = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
      const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
      if (!text) throw new ApiError(503, 'ai_unavailable', 'The AI assistant did not return an answer. Try rephrasing.');
      return text;
    },
  };
}
