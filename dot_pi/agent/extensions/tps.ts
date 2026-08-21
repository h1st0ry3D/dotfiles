/**
 * TPS (Tokens Per Second) Metrics Extension for Pi
 *
 * Tracks and displays real-time token generation speed during streaming.
 *
 * Calc notes:
 * - Generation TPS = tokens / (first token -> last token), NOT wall-clock from
 *   message_start. Wall-clock includes TTFT/queue/thinking and reads slower
 *   than other tools.
 * - Live estimate uses text deltas only (thinking/toolcall excluded) so live
 *   and final numbers are consistent.
 * - Final uses provider usage.output when available.
 *
 * Display note:
 * - Status key "00-tps" sorts first alphabetically in the footer status line
 *   (footer sorts by key via localeCompare), so TPS shows before other
 *   extension statuses. A dedicated line is not possible without replacing
 *   the whole footer via ctx.ui.setFooter().
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";

interface StreamingMetrics {
  startTime: number;
  firstTokenTime: number | undefined;
  charCount: number;
  isStreaming: boolean;
}

// Rough average characters per token for English text. Without a tokenizer this
// is an approximation, but it gives a useful live speed indicator.
const CHARS_PER_TOKEN = 4;

// Key prefix controls footer order (footer sorts alphabetically):
// 0-cwd-edits, 1-vision, 2-tps, caveman
const STATUS_KEY = "2-tps";

// Fixed-width TPS value so status line doesn't shift on every update.
const TPS_WIDTH = 3;

function formatTps(tps: number): string {
  return `${String(Math.round(tps)).padStart(TPS_WIDTH)} t/s`;
}

function countOutputChars(event: AssistantMessageEvent): number {
  if (event.type === "text_delta") return event.delta.length;
  return 0;
}

function estimateTokens(charCount: number): number {
  return charCount / CHARS_PER_TOKEN;
}

export default function (pi: ExtensionAPI) {
  let metrics: StreamingMetrics | undefined;

  function updateLiveStatus(ctx: ExtensionContext) {
    if (!metrics || !metrics.isStreaming) return;
    if (metrics.firstTokenTime === undefined) return;

    const now = Date.now();
    // Generation window: first token -> now. Excludes TTFT/queue/thinking.
    const elapsed = (now - metrics.firstTokenTime) / 1000;
    const tokens = estimateTokens(metrics.charCount);

    if (elapsed > 0 && tokens > 0) {
      const tps = Math.round((tokens / elapsed) * 10) / 10;
      ctx.ui.setStatus(STATUS_KEY, `⚡ ${formatTps(tps)}`);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    // Clear legacy keys from older versions of this extension
    ctx.ui.setStatus("tps", undefined);
  });

  pi.on("message_start", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    metrics = {
      startTime: Date.now(),
      firstTokenTime: undefined,
      charCount: 0,
      isStreaming: true,
    };

    ctx.ui.setStatus(STATUS_KEY, "⚡ ...");
  });

  pi.on("message_update", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (!metrics || !metrics.isStreaming) return;

    const deltaChars = countOutputChars(event.assistantMessageEvent);
    if (deltaChars > 0) {
      if (metrics.firstTokenTime === undefined) {
        metrics.firstTokenTime = Date.now();
      }
      metrics.charCount += deltaChars;
    }

    updateLiveStatus(ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (!metrics) return;

    metrics.isStreaming = false;

    const usage = event.message.usage;
    const endTime = Date.now();
    // Generation window; fall back to startTime if nothing streamed (tool-only turn).
    const genStart = metrics.firstTokenTime ?? metrics.startTime;
    const elapsed = (endTime - genStart) / 1000;
    const totalTime = (endTime - metrics.startTime) / 1000;
    const totalTokens = usage?.output ?? Math.round(estimateTokens(metrics.charCount));

    if (totalTokens > 0 && elapsed > 0) {
      const finalTps = Math.round(totalTokens / elapsed);
      const ttft = metrics.firstTokenTime ? (metrics.firstTokenTime - metrics.startTime) / 1000 : 0;
      const summary =
        ttft > 0.1
          ? `✓ ${totalTokens} tok ${elapsed.toFixed(1)}s (${formatTps(finalTps)}, TTFT ${ttft.toFixed(1)}s)`
          : `✓ ${totalTokens} tok ${elapsed.toFixed(1)}s (${formatTps(finalTps)})`;
      ctx.ui.setStatus(STATUS_KEY, summary);
    } else {
      ctx.ui.setStatus(STATUS_KEY, undefined);
    }

    metrics = undefined;
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    metrics = undefined;
  });
}
