import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Multiple llama-swap instances. Each gets its own provider so requests
 * route to the right PC (a provider has a single baseUrl). Models from
 * every endpoint are merged into one picker.
 *
 * host: short tag shown in the model name so you can tell the PCs apart.
 * providerId: unique; the first keeps "llama-swap" for backward compat
 * with an already-selected model.
 */
const ENDPOINTS = [
  { host: "99", base: "http://192.168.0.99:8080", providerId: "llama-swap" },
  { host: "61", base: "http://192.168.0.61:8080", providerId: "llama-swap-61" },
] as const;

/**
 * Vision capability is determined by the yaml config (--mmproj presence),
 * not by load state. For running models the upstream llama-server /props
 * is authoritative; fall back to name/description heuristics so vision
 * models register as multimodal even when not loaded at pi startup.
 */
function looksVision(m: LlamaSwapModel): boolean {
  const desc = (m.description ?? "").toLowerCase();
  if (/\bno\s+mmproj/.test(desc)) return false;
  if (desc.includes("vision: yes")) return true;
  if (desc.includes("vision: no")) return false;
  if ((m.name ?? "").toLowerCase().includes("vision")) return true;
  if (m.id.toLowerCase().includes("vision")) return true;
  return desc.includes("mmproj") || desc.includes("multimodal");
}

/** llama-swap writes "reasoning: on/off" per model in the description. */
function descReasoning(m: LlamaSwapModel): boolean {
  return /\breasoning:\s*on\b/i.test(m.description ?? "");
}

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

/** Fetch /running: which models are loaded, plus the launch cmd + upstream proxy URL. */
async function fetchRunning(base: string, signal?: AbortSignal): Promise<Map<string, RunningEntry>> {
  try {
    const res = await fetch(`${base}/running`, { signal: signal ?? AbortSignal.timeout(3000) });
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

/**
 * Parse the context size the llama-server was actually started with.
 * The launch cmd from /running is the authoritative server config (e.g. "-c 150000"),
 * so no extra request is needed for the exact value of a loaded model.
 */
function parseCmdContext(cmd?: string): number | undefined {
  if (!cmd) return undefined;
  const m =
    cmd.match(/(?:^|\s)--ctx-size(?:=|\s+)(\d+)/) ?? cmd.match(/(?:^|\s)-c(?:=|\s+)(\d+)/);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Fetch /props from the running llama-server itself (proxy URL from /running).
 * Cheap and side-effect free, unlike llama-swap's /props?model= which
 * auto-starts servers for non-running models.
 */
async function fetchUpstreamProps(proxy: string, signal?: AbortSignal): Promise<ModelFeatures | undefined> {
  try {
    const base = proxy.replace(/\/+$/, "");
    const res = await fetch(`${base}/props`, { signal: signal ?? AbortSignal.timeout(3000) });
    if (!res.ok) return undefined;
    const body = await res.json() as {
      default_generation_settings?: {
        n_ctx?: number;
        params?: { n_predict?: number };
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

/**
 * Fallback for models that are not loaded: parse the context size from
 * name/description. llama-swap writes "ctx: 150k" / "ctx: 1m" in
 * descriptions and "NNNk" / "NNNm" in model ids. k/m are decimal:
 * 150k -> 150000, 1m -> 1000000 (llama-swap starts servers with
 * -c 150000). Note: "1m" in quant names (iq1m, udiq2m) must not match —
 * the "ctx:" patterns above win because descriptions are scanned first.
 */
function extractContextK(m: LlamaSwapModel): number {
  if (typeof m.context_window === "number" && m.context_window > 0) return m.context_window;
  if (typeof m.max_model_len === "number" && m.max_model_len > 0) return m.max_model_len;
  const lsCtx = m.meta?.llamaswap?.context_length;
  if (typeof lsCtx === "number" && lsCtx > 0) return lsCtx;
  const sources = [m.description, m.name, m.id].filter(Boolean) as string[];
  const scale = (v: number, unit: string) => (unit === "m" ? v * 1_000_000 : v * 1000);
  for (const s of sources) {
    const m2 = s.match(/ctx:\s*(\d+)\s*([km])\b/i);
    if (m2) return scale(parseInt(m2[1], 10), m2[2].toLowerCase());
  }
  for (const s of sources) {
    const m2 = s.match(/(\d+)\s*([km])\s*(?:ctx|context)/i);
    if (m2) return scale(parseInt(m2[1], 10), m2[2].toLowerCase());
  }
  for (const s of sources) {
    const m2 = s.match(/(\d+)\s*([km])\b/i);
    if (m2) {
      const val = parseInt(m2[1], 10);
      if (val >= 4 && val <= 1024) return scale(val, m2[2].toLowerCase());
    }
  }
  return 128000;
}

type BuiltModel = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
};

/**
 * Discover models + per-model context/vision/reasoning from one llama-swap
 * instance.
 *
 * Context resolution per model:
 *   loaded:  upstream llama-server n_ctx  ->  launch cmd -c  ->  name/desc heuristic
 *   unloaded:  name/desc heuristic
 */
async function buildModelsFor(base: string, hostLabel: string, signal?: AbortSignal): Promise<BuiltModel[]> {
  const apiBase = `${base}/v1`;
  const [modelsRes, running] = await Promise.all([
    fetch(`${apiBase}/models`, { signal: signal ?? AbortSignal.timeout(5000) }),
    fetchRunning(base, signal),
  ]);
  const body = await modelsRes.json() as { data: LlamaSwapModel[] };

  const feats = new Map<string, ModelFeatures>();
  await Promise.all(
    [...running.values()].map(async (e) => {
      if (e.proxy) {
        const f = await fetchUpstreamProps(e.proxy, signal);
        if (f) feats.set(e.model ?? "", f);
      }
    }),
  );

  return body.data.map((m) => {
    const entry = running.get(m.id);
    const f = feats.get(m.id);
    const ctx = f?.n_ctx ?? parseCmdContext(entry?.cmd) ?? extractContextK(m);
    const hasVision = f?.modalities?.vision ?? looksVision(m);
    const supportsReasoning = f?.supportsReasoning ?? descReasoning(m);
    // If the model's llama-swap config sets n_predict, honor it (clamped to the
    // context window). Otherwise leave the output limit "unbounded" by requesting
    // the full context window, so the model decides its own reasoning + answer
    // length instead of being truncated by an artificial cap.
    const maxTokens = f?.n_predict && f.n_predict > 0 ? Math.min(f.n_predict, ctx) : ctx;
    return {
      id: m.id,
      name: `${hasVision ? "📷 " : ""}${m.name ?? m.id} (${Math.round(ctx / 1000)}K ctx${
        supportsReasoning ? " 🤔" : ""
      }) ${entry ? "●" : "○"} @${hostLabel}`,
      reasoning: supportsReasoning,
      input: hasVision ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: ctx,
      maxTokens,
    };
  });
}

export default async function (pi: ExtensionAPI) {
  await Promise.all(
    ENDPOINTS.map(async ({ host, base, providerId }) => {
      // Initial discovery (awaited) so startup and `pi --list-models` see
      // models right away. If this endpoint is down, register empty and let
      // refreshModels fill it later — don't crash pi or block other endpoints.
      let initial: BuiltModel[] = [];
      try {
        initial = await buildModelsFor(base, host);
      } catch (err) {
        console.error(
          `[llama-swap] could not reach ${base} (${(err as Error)?.message ?? err}); ` +
            `provider "${providerId}" registered without models until reachable.`,
        );
      }

      pi.registerProvider(providerId, {
        baseUrl: `${base}/v1`,
        apiKey: "dummy",
        api: "openai-completions",
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          maxTokensField: "max_tokens",
          supportsStore: false,
        },
        models: initial,
        refreshModels: async ({ signal }) => buildModelsFor(base, host, signal),
      });
    }),
  );
}
