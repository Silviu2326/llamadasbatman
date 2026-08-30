export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CerebrasStreamOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  /** Carlos needs a short turn; the guru thinks off the hot path and needs room. */
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number;
}

export interface CompatibleStreamOptions extends CerebrasStreamOptions {
  baseUrl: string;
  provider: string;
}

interface CerebrasChunk {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
}

export async function* parseSseData(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        yield line.slice(5).trimStart();
      }

      if (done) break;
    }

    if (pending.startsWith("data:")) yield pending.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}

export async function* streamCerebras(
  options: CerebrasStreamOptions,
): AsyncGenerator<string> {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      reasoning_effort: options.reasoningEffort ?? "low",
      max_completion_tokens: options.maxTokens ?? 110,
      temperature: options.temperature ?? 0.58,
      top_p: 0.9,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Cerebras ${response.status}: ${detail || response.statusText}`);
  }
  if (!response.body) throw new Error("Cerebras response did not include a stream.");

  for await (const data of parseSseData(response.body)) {
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data) as CerebrasChunk;
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) yield content;
  }
}

/** OpenAI-compatible providers used by the off-path Guru (for example Groq). */
export async function* streamOpenAICompatible(
  options: CompatibleStreamOptions,
): AsyncGenerator<string> {
  const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      max_tokens: options.maxTokens ?? 400,
      temperature: options.temperature ?? 0.35,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`${options.provider} ${response.status}: ${detail || response.statusText}`);
  }
  if (!response.body) throw new Error(`${options.provider} response did not include a stream.`);

  for await (const data of parseSseData(response.body)) {
    if (!data || data === '[DONE]') return;
    const chunk = JSON.parse(data) as CerebrasChunk;
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) yield content;
  }
}

export async function completeOpenAICompatible(options: CompatibleStreamOptions): Promise<string> {
  let text = '';
  for await (const delta of streamOpenAICompatible(options)) text += delta;
  return text;
}

/** Same endpoint, drained. For callers that want the whole answer, not a stream. */
export async function completeCerebras(options: CerebrasStreamOptions): Promise<string> {
  let text = "";
  for await (const delta of streamCerebras(options)) text += delta;
  return text;
}
