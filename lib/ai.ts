"use client"

// Client-side AI features. The user's API key lives in localStorage and is
// sent ONLY to the provider endpoint they configured — never to Convex or
// any ShowList server. All providers are OpenAI-compatible chat completions
// endpoints (Gemini and OpenRouter both expose them).

import { useSyncExternalStore } from "react"

export type AiProvider = "openai" | "openrouter" | "gemini" | "custom"

export type AiConfig = {
  provider: AiProvider
  apiKey: string
  model: string
  baseUrl: string
}

export const AI_CONFIG_STORAGE_KEY = "showlist:ai-config"
const AI_CONFIG_EVENT = "showlist:ai-config-changed"

export const AI_PROVIDER_PRESETS: Record<
  AiProvider,
  { label: string; baseUrl: string; defaultModel: string; keyHint: string }
> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyHint: "sk-...",
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    keyHint: "sk-or-...",
  },
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    keyHint: "AIza...",
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    defaultModel: "",
    keyHint: "provider's key",
  },
}

export function loadAiConfig(): AiConfig | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    if (
      typeof parsed.apiKey !== "string" ||
      parsed.apiKey === "" ||
      typeof parsed.provider !== "string" ||
      !(parsed.provider in AI_PROVIDER_PRESETS)
    ) {
      return null
    }
    const preset = AI_PROVIDER_PRESETS[parsed.provider as AiProvider]
    const baseUrl =
      parsed.provider === "custom"
        ? typeof parsed.baseUrl === "string" && parsed.baseUrl !== ""
          ? parsed.baseUrl.replace(/\/$/, "")
          : ""
        : preset.baseUrl
    if (baseUrl === "") return null
    return {
      provider: parsed.provider as AiProvider,
      apiKey: parsed.apiKey,
      model:
        typeof parsed.model === "string" && parsed.model !== ""
          ? parsed.model
          : preset.defaultModel,
      baseUrl,
    }
  } catch {
    return null
  }
}

export function saveAiConfig(config: AiConfig | null) {
  if (config === null) {
    window.localStorage.removeItem(AI_CONFIG_STORAGE_KEY)
  } else {
    window.localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config))
  }
  window.dispatchEvent(new Event(AI_CONFIG_EVENT))
}

// useAiConfig — reactive localStorage-backed config via useSyncExternalStore:
// hydration-safe (server sees null), and consumers re-render when the
// settings dialog saves or another tab changes the key.
let snapshotCache: { raw: string | null; config: AiConfig | null } | null =
  null

function subscribe(onChange: () => void) {
  window.addEventListener(AI_CONFIG_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(AI_CONFIG_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

function getSnapshot(): AiConfig | null {
  const raw = window.localStorage.getItem(AI_CONFIG_STORAGE_KEY)
  // getSnapshot must be referentially stable between store changes.
  if (snapshotCache === null || snapshotCache.raw !== raw) {
    snapshotCache = { raw, config: loadAiConfig() }
  }
  return snapshotCache.config
}

function getServerSnapshot(): AiConfig | null {
  return null
}

export function useAiConfig(): AiConfig | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function aiConfigured(config: AiConfig | null): boolean {
  return config !== null
}

export type AiRecommendation = {
  title: string
  year?: number
  mediaType?: "movie" | "tv"
  reason?: string
}

// One JSON-object chat completion. Errors carry the provider's message when
// available so the UI can show why a key failed.
export async function aiRecommendJson(
  system: string,
  user: string,
  config: AiConfig
): Promise<AiRecommendation[]> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  })
  if (!response.ok) {
    let detail = ""
    try {
      const body = (await response.json()) as {
        error?: { message?: string }
      }
      detail = body.error?.message ? `: ${body.error.message}` : ""
    } catch {
      // keep empty detail
    }
    throw new Error(`AI request failed (${response.status})${detail}`)
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("Unexpected AI response shape")
  }
  // Providers that ignore json_object mode may wrap the object in fences.
  const stripped = content.replace(/^```(?:json)?\s*|\s*```$/g, "")
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new Error("AI returned invalid JSON")
  }
  const recommendations =
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as { recommendations?: unknown }).recommendations)
      ? (parsed as { recommendations: unknown[] }).recommendations
      : null
  if (recommendations === null) {
    throw new Error("AI returned no recommendations")
  }
  return recommendations
    .filter(
      (item): item is AiRecommendation =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { title?: unknown }).title === "string"
    )
    .map((item) => ({
      title: item.title.trim(),
      year: typeof item.year === "number" ? item.year : undefined,
      mediaType:
        item.mediaType === "movie" || item.mediaType === "tv"
          ? item.mediaType
          : undefined,
      reason:
        typeof item.reason === "string" && item.reason.trim() !== ""
          ? item.reason.trim()
          : undefined,
    }))
    .slice(0, 12)
}

// --- Prompts -------------------------------------------------------------

export const DESCRIBE_SYSTEM_PROMPT = [
  "You suggest real movies and TV shows for a tracker app.",
  "The user describes what they feel like watching (a vibe, a mashup, a mood).",
  "Return ONLY a JSON object:",
  '{"recommendations":[{"title":"string","year":number,"mediaType":"movie"|"tv","reason":"max 80 chars, why it matches"}]}',
  "Give 4-8 real, existing titles that best match the description.",
  "Every title must be a real release; do not invent shows or movies.",
].join("\n")

export const FOR_YOU_SYSTEM_PROMPT = [
  "You are a movie/TV recommendation engine inside a personal tracker app.",
  "Based on the user's library, recommend 8-10 titles they are likely to enjoy.",
  "Return ONLY a JSON object:",
  '{"recommendations":[{"title":"string","mediaType":"movie"|"tv","reason":"max 90 chars, tie it to their taste"}]}',
  "Mix well-known and lesser-known picks. NEVER recommend anything already in their library.",
  "Every title must be a real release; do not invent shows or movies.",
].join("\n")
