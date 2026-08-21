import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const KEY = "1-vision";
const LS_BASE = "http://192.168.0.99:8080";

// Session generation counter. Bumped on start/shutdown; async work checks it
// before touching ctx — old ctx throws after /reload / newSession / fork.
let sessionToken = 0;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx: any) => {
    sessionToken++;
    const token = sessionToken;
    const hasVision = await hasVisionCaps(ctx);
    if (token !== sessionToken) return; // stale ctx — reload happened
    setIndicatorSafe(ctx, hasVision);
  });

  pi.on("model_select", async (_event: any, ctx: any) => {
    const token = sessionToken;
    const hasVision = await hasVisionCaps(ctx);
    if (token !== sessionToken) return;
    if (!hasVision) {
      // Retry a few times with our own sleeps — but bail if session changed
      for (let i = 0; i < 5; i++) {
        await sleep(1500);
        if (token !== sessionToken) return;
        if (await checkProps(ctx.model?.id)) {
          if (token !== sessionToken) return;
          setIndicatorSafe(ctx, true);
          return;
        }
      }
    }
    if (token !== sessionToken) return;
    setIndicatorSafe(ctx, hasVision);
  });

  pi.on("session_shutdown", () => {
    sessionToken++;
  });
}

async function hasVisionCaps(ctx: any): Promise<boolean> {
  // 1) pi's own model definition — correct once provider registration
  //    knows about vision (llama-swap.ts heuristics)
  if (ctx.model?.input?.includes("image")) return true;

  // 2) Mirror the llama-swap provider's config heuristics — avoids the
  //    /props call that would auto-start the server
  if (ctx.model?.provider === "llama-swap" && looksVision(ctx.model)) return true;

  // 3) /props on the running backend (may auto-start for non-running)
  return checkProps(ctx.model?.id);
}

/** Matches llama-swap.ts provider registration heuristics */
function looksVision(model: any): boolean {
  const desc = String(model.description ?? "").toLowerCase();
  if (/\bno\s+mmproj/.test(desc)) return false;
  if (String(model.name ?? "").toLowerCase().includes("vision")) return true;
  if (String(model.id ?? "").toLowerCase().includes("vision")) return true;
  return desc.includes("mmproj") || desc.includes("multimodal");
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

function setIndicatorSafe(ctx: any, hasVision: boolean) {
  try {
    if (hasVision) {
      // Trailing "space" must be U+2800 (braille blank): pi's footer sanitizer
      // collapses/strips normal spaces (replace(/ +/g," ") + trim), so a real
      // trailing space would vanish. U+2800 renders blank but survives.
      // U+FE0F forces full-size emoji presentation for the eye (some fonts
      // render it small/text-style when followed by a non-space char).
      ctx.ui.setStatus(KEY, ctx.ui.theme.fg("accent", "👁\uFE0F\u2800"));
    } else {
      ctx.ui.setStatus(KEY, undefined);
    }
  } catch {
    // stale ctx (post-reload) — session_start in the new runtime will re-set
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
