import type { EmotionReading } from "../../pipelines/vendravaProtocol";
import { completeCerebras, completeOpenAICompatible, type ChatMessage } from "../llm/cerebrasStream";

/**
 * The guru never sits in the turn path. It runs in the dead time while Carlos is
 * speaking and leaves a one-line directive for the *next* turn, so its own latency
 * never reaches the caller. If it is slow or fails, the previous directive stands.
 */
const GURU_PROMPT = `You are the strategist listening in on a live sales call. Carlos is the
voice agent talking to the caller; you never speak to the caller yourself.

You get the transcript so far and how the caller sounded on their last turn. Decide what
Carlos should do on his next turn: what to drop, what to ask, when to stop pitching.

Weigh the delivery as much as the words. Someone talking fast with short answers wants
this over with. Someone hesitating is unconvinced, not confused. Someone cutting in has
already decided something. Say what that means for the next turn specifically — do not
give generic sales advice.

Reply with exactly two lines and nothing else:
READ: <one sentence on where the caller actually stands>
NEXT: <one imperative for Carlos's next reply, under 25 words>`;

export interface GuruAdvice {
  read: string;
  directive: string;
}

interface GuruOptions {
  apiKey: string;
  model: string;
  provider?: string;
  history: ChatMessage[];
  emotion?: EmotionReading;
  previousDirective?: string;
  agentContext?: string;
  structure?: string;
  instructions?: string;
  signal: AbortSignal;
}

function guruSystemPrompt(options: GuruOptions): string {
  return [
    GURU_PROMPT,
    options.structure ? `\nSUPERVISOR STRUCTURE: ${options.structure}` : '',
    options.instructions?.trim() ? `\nCUSTOM SUPERVISOR INSTRUCTIONS:\n${options.instructions.trim()}` : '',
    '\nThe supervisor is invisible. Never address the caller, never produce spoken copy, and only return the READ/NEXT lines requested above.',
  ].filter(Boolean).join('\n');
}

async function completeGuru(options: GuruOptions, messages: ChatMessage[]): Promise<string> {
  if (options.provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new Error('GROQ_API_KEY is required for the selected Guru provider.');
    return completeOpenAICompatible({
      apiKey,
      baseUrl: 'https://api.groq.com/openai/v1',
      provider: 'Groq',
      model: options.model,
      messages,
      signal: options.signal,
      maxTokens: 400,
    });
  }
  if (options.provider === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for the selected Guru provider.');
    return completeOpenAICompatible({
      apiKey,
      baseUrl: 'https://api.deepseek.com/v1',
      provider: 'DeepSeek',
      model: options.model,
      messages,
      signal: options.signal,
      maxTokens: 400,
    });
  }
  return completeCerebras({ apiKey: options.apiKey, model: options.model, messages, signal: options.signal, maxTokens: 400, reasoningEffort: 'medium' });
}

export async function askGuru(options: GuruOptions): Promise<GuruAdvice | undefined> {
  // Drop the system prompt; the guru gets its own, and the raw turns are what matter.
  const turns = options.history
    .filter((message) => message.role !== "system")
    .slice(-12)
    .map((message) => `${message.role === "user" ? "Caller" : "Carlos"}: ${message.content}`)
    .join("\n");

  if (!turns.trim()) return undefined;

  const briefing = [
    options.agentContext?.trim() ? `Full agent context, strategy and operating rules:\n${options.agentContext.trim().slice(0, 16_000)}` : undefined,
    `Transcript so far:\n${turns}`,
    options.emotion
      ? `How the caller sounded last turn: ${options.emotion.label} ` +
        `(${options.emotion.wordsPerMinute} wpm, arousal ${options.emotion.arousal}` +
        (options.emotion.replyDelayMs === undefined
          ? ""
          : `, waited ${options.emotion.replyDelayMs} ms before replying`) +
        `, ${options.emotion.interruptions} interruptions so far).`
      : undefined,
    options.previousDirective ? `Your previous directive was: ${options.previousDirective}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");

  const text = await completeGuru(options, [
    { role: "system", content: guruSystemPrompt(options) },
    { role: "user", content: briefing },
  ]);

  return parseGuruAdvice(text);
}

/** Two prefixed lines instead of JSON: an LLM slip degrades to "no advice", never a crash. */
export function parseGuruAdvice(text: string): GuruAdvice | undefined {
  const read = /^\s*READ:\s*(.+)$/im.exec(text)?.[1]?.trim();
  const directive = /^\s*NEXT:\s*(.+)$/im.exec(text)?.[1]?.trim();
  if (!directive) return undefined;
  return { read: read || "No read available.", directive };
}
