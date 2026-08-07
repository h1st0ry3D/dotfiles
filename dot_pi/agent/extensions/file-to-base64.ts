/**
 * file-to-base64 extension
 *
 * - Tool: file_to_base64 — read a file, return its base64 (inline if small,
 *   spilled to /tmp/b64-*.txt if large).
 * - Command: /b64 <path> [--data-uri] — print base64 straight to the TUI.
 *
 * Typical use: turn an image path into a base64 data URI for llama-server /
 * llama-swap vision requests (llama-server rejects http(s) image URLs —
 * it only accepts data: URIs).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Inline threshold: keep tool output / TUI readable. Above this, spill to /tmp.
const INLINE_B64_LIMIT = 200_000; // chars (~150KB file)

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
};

function dataUriPrefix(filePath: string): string {
  const mime = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,`;
}

function b64For(filePath: string, asDataUri: boolean): { b64: string; inline: boolean; outPath?: string } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file not found: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`not a regular file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath);
  let b64 = raw.toString("base64");
  if (asDataUri) b64 = dataUriPrefix(filePath) + b64;
  if (b64.length <= INLINE_B64_LIMIT) return { b64, inline: true };
  const outPath = path.join(os.tmpdir(), `b64-${path.basename(filePath)}.txt`);
  fs.writeFileSync(outPath, b64);
  return { b64, inline: false, outPath };
}

const TOOL_PARAMS = Type.Object({
  path: Type.String({ description: "Absolute or relative path to the file to encode" }),
  as_data_uri: Type.Optional(
    Type.Boolean({ description: "Prefix with data:<mime>;base64, (default true for images)" }),
  ),
});

export default function fileToBase64Extension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "file_to_base64",
    label: "File → Base64",
    description:
      "Read a file (e.g. image) and return its base64 encoding, optionally as a data: URI. Small files are returned inline; large files are written to /tmp/b64-<name>.txt and the path is returned.",
    promptSnippet: "Encode a file path to base64",
    promptGuidelines: [
      "Use file_to_base64 when the user gives a file path and wants base64 or a data: URI (e.g. to paste into a vision chat request).",
      "For files whose base64 is returned inline, the output is safe to embed directly in a JSON image_url.url field.",
    ],
    parameters: TOOL_PARAMS,
    async execute(_toolCallId, params: { path: string; as_data_uri?: boolean }) {
      try {
        const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(params.path);
        const asDataUri = params.as_data_uri ?? isImage;
        const { b64, inline, outPath } = b64For(params.path, asDataUri);
        return {
          content: [
            {
              type: "text" as const,
              text: inline
                ? b64
                : `base64 too large to inline (${b64.length} chars). Written to ${outPath}\nStart: ${b64.slice(0, 80)}…`,
            },
          ],
          details: {
            file: params.path,
            chars: b64.length,
            inline,
            outPath,
            dataUri: asDataUri,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `file_to_base64 failed: ${(err as Error).message}` }],
          details: { error: (err as Error).message },
        };
      }
    },
  });

  pi.registerCommand("b64", {
    description: "Encode a file to base64: /b64 <path> [--data-uri]",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const asDataUri = parts.includes("--data-uri") || parts.includes("-d");
      const filePath = parts.find((p) => !p.startsWith("-"));
      if (!filePath) {
        ctx.ui.notify("Usage: /b64 <path> [--data-uri]", "warning");
        return;
      }
      try {
        const { b64, outPath } = b64For(filePath, asDataUri);
        if (outPath) {
          ctx.ui.notify(`base64 (${b64.length} chars) written to ${outPath}`, "info");
        } else {
          // Spill to /tmp anyway — TUI can't show multi-KB inline text usefully.
          const spill = path.join(os.tmpdir(), `b64-${path.basename(filePath)}.txt`);
          fs.writeFileSync(spill, b64);
          ctx.ui.notify(`base64 (${b64.length} chars) written to ${spill}`, "info");
        }
      } catch (err) {
        ctx.ui.notify(`b64 failed: ${(err as Error).message}`, "error");
      }
    },
  });
}
