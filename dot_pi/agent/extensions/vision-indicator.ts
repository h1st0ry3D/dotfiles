import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const KEY = "vision";
const LS_BASE = "http://192.168.0.99:8080";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx: any) => {
    const hasVision = await hasVisionCaps(ctx);
    setIndicator(ctx, hasVision);
  });

  pi.on("model_select", async (_event: any, ctx: any) => {
    // Check immediately
    let hasVision = await hasVisionCaps(ctx);
    if (!hasVision) {
      // Retry a few times — /props may not be ready right after model loads
      hasVision = await pollProps(ctx.model?.id, 5, 1500);
    }
    setIndicator(ctx, hasVision);
  });

  pi.on("session_shutdown", async (_event: any, ctx: any) => {
    ctx.ui.setStatus(KEY, undefined);
  });
}

async function hasVisionCaps(ctx: any): Promise<boolean> {
  // 1) Check pi's own model definition — correct for built-in providers
  //    and llama-swap models that were loaded at startup
  if (ctx.model?.input?.includes("image")) return true;

  // 2) Immediate /props check
  return checkProps(ctx.model?.id);
}

async function pollProps(modelId: string | undefined, retries: number, delayMs: number): Promise<boolean> {
  if (!modelId) return false;
  for (let i = 0; i < retries; i++) {
    await sleep(delayMs);
    if (await checkProps(modelId)) return true;
  }
  return false;
}

async function checkProps(modelId: string | undefined): Promise<boolean> {
  if (!modelId) return false;
  try {
    const res = await fetch(`${LS_BASE}/props?model=${encodeURIComponent(modelId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.json() as { modalities?: { vision?: boolean } };
    return body.modalities?.vision === true;
  } catch {
    return false;
  }
}

function setIndicator(ctx: any, hasVision: boolean) {
  if (hasVision) {
    ctx.ui.setStatus(KEY, ctx.ui.theme.fg("accent", "👁"));
  } else {
    ctx.ui.setStatus(KEY, undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
