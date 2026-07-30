import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE = "http://192.168.0.99:8080";
const API_BASE = `${BASE}/v1`;
const PROVIDER_ID = "llama-swap";

interface LlamaSwapModel {
  id: string;
  name?: string;
  description?: string;
  context_window?: number;
  max_model_len?: number;
  meta?: {
    llamaswap?: {
      context_length?: number;
      aliases?: string[];
    };
  };
}

interface ModelFeatures {
  n_ctx?: number;
  modalities?: { vision?: boolean };
  n_predict?: number;
  supportsReasoning?: boolean;
}

interface RunningEntry {
  model?: string;
  state: string;
  proxy?: string;
  cmd?: string;
  ttl?: number;
}

/** Fetch /running to see which models are loaded */
async function fetchRunning(): Promise<Map<string, RunningEntry>> {
  try {
    const res = await fetch(`${BASE}/running`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return new Map();
    const body = await res.json() as { running?: RunningEntry[] };
    const map = new Map<string, RunningEntry>();
    for (const e of body.running ?? []) {
      if (e.model) map.set(e.model, e);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Fetch /props for exact context + vision + reasoning + max output from the backend */
async function fetchModelProps(modelId: string): Promise<ModelFeatures | undefined> {
  try {
    const res = await fetch(`${BASE}/props?model=${encodeURIComponent(modelId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return undefined;
    const body = await res.json() as {
      default_generation_settings?: {
        n_ctx?: number;
        params?: {
          n_predict?: number;
          reasoning_format?: string;
        };
      };
      modalities?: { vision?: boolean };
      chat_template_caps?: { supports_preserve_reasoning?: boolean };
    };
    return {
      n_ctx: body.default_generation_settings?.n_ctx,
      modalities: body.modalities,
      n_predict: body.default_generation_settings?.params?.n_predict,
      supportsReasoning: body.chat_template_caps?.supports_preserve_reasoning ?? false,
    };
  } catch {
    return undefined;
  }
}

function extractContextK(m: LlamaSwapModel): number {
  if (typeof m.context_window === "number" && m.context_window > 0) return m.context_window;
  if (typeof m.max_model_len === "number" && m.max_model_len > 0) return m.max_model_len;
  const lsCtx = m.meta?.llamaswap?.context_length;
  if (typeof lsCtx === "number" && lsCtx > 0) return lsCtx;
  const sources = [m.description, m.name, m.id].filter(Boolean) as string[];
  for (const s of sources) {
    const m2 = s.match(/(\d+)\s*K\s*(?:ctx|context|max\s*ctx|native\s*ctx)/i);
    if (m2) return parseInt(m2[1], 10) * 1024;
  }
  for (const s of sources) {
    const m2 = s.match(/(\d+)\s*K/);
    if (m2) {
      const val = parseInt(m2[1], 10);
      if (val >= 4 && val <= 1024) return val * 1024;
    }
  }
  return 128000;
}

export default async function (pi: ExtensionAPI) {
  const [modelsRes, running] = await Promise.all([
    fetch(`${API_BASE}/models`, { signal: AbortSignal.timeout(5000) }),
    fetchRunning(),
  ]);

  const body = await modelsRes.json() as { data: LlamaSwapModel[] };

  const featResults = await Promise.all(
    body.data.map(async (m) => {
      const props = running.has(m.id) ? await fetchModelProps(m.id) : undefined;
      return {
        id: m.id,
        ctx: props?.n_ctx ?? extractContextK(m),
        hasVision: props?.modalities?.vision ?? false,
        supportsReasoning: props?.supportsReasoning ?? false,
        nPredict: props?.n_predict,
      };
    }),
  );
  const featMap = new Map(featResults.map((r) => [r.id, r]));

  pi.registerProvider(PROVIDER_ID, {
    baseUrl: API_BASE,
    apiKey: "dummy",
    api: "openai-completions",
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
      supportsStore: false,
    },
    models: body.data.map((m) => {
      const feat = featMap.get(m.id);
      const ctx = feat?.ctx ?? 128000;
      const isLoaded = running.has(m.id);
      const hasVision = feat?.hasVision ?? false;
      const supportsReasoning = feat?.supportsReasoning ?? false;
      const nPredict = feat?.nPredict;
      const maxTokens = nPredict && nPredict > 0 ? Math.min(nPredict, 32768) : Math.min(ctx, 32768);
      const input: ("text" | "image")[] = hasVision ? ["text", "image"] : ["text"];
      const reasonLabel = supportsReasoning ? " 🤔" : "";
      return {
        id: m.id,
        name: `${hasVision ? "📷 " : ""}${m.name ?? m.id} (${Math.round(ctx / 1024)}K ctx${reasonLabel}) ${isLoaded ? "●" : "○"}`,
        reasoning: supportsReasoning,
        input,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: ctx,
        maxTokens,
      };
    }),
  });

}
