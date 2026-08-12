/**
 * CWD Edit Permissions Extension
 *
 * Hybrid permission mode: bypasses edit/write in the current working directory,
 * but prompts for approval when editing/writing outside it.
 *
 * Works alongside @zackify/pi-claude-permissions.
 * Enabled via `cwdEdit.enabled: true` in settings.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { basename, dirname, resolve } from "node:path";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";

interface CwdEditConfig {
  cwdEdit?: {
    enabled?: boolean;
    cwd?: string;
  };
}

export default async function cwdEditPermissions(pi: ExtensionAPI) {
  const config = await loadConfig();

  let cwd = resolve(config.cwdEdit?.cwd ?? process.cwd());
  let enabled = config.cwdEdit?.enabled ?? false;

  pi.on("session_start", (_event, ctx) => {
    if (!config.cwdEdit?.cwd) cwd = resolve(ctx.cwd);
    if (enabled) {
      ctx.ui.setStatus("cwd-edits", `📁`);
    } else {
      ctx.ui.setStatus("cwd-edits", undefined);
    }
  });

  pi.registerCommand("cwd", {
    description: "Enable or disable cwd edit permissions",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action !== "on" && action !== "off") {
        ctx.ui.notify("Usage: /cwd on | /cwd off", "warning");
        return;
      }

      const config = await loadConfig();
      enabled = action === "on";
      config.cwdEdit = { ...config.cwdEdit, enabled };

      await saveConfig(config);

      // Update status immediately
      if (enabled) {
        ctx.ui.setStatus("cwd-edits", `📁`);
      } else {
        ctx.ui.setStatus("cwd-edits", undefined);
      }
      
      ctx.ui.notify(enabled ? "CWD edit permissions enabled" : "CWD edit permissions disabled", "info");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled) return;

    const toolName = event.toolName;

    // Intercept write/edit tools
    if (toolName === "write" || toolName === "edit") {
      const rawPath = String(event.input.path ?? event.input.file_path ?? "");
      const targetPath = resolveInputPath(rawPath, cwd);
      if (!targetPath) {
        return { block: true, reason: `Blocked ${toolName}: could not determine target path` };
      }

      if (await isPathInsideCwd(targetPath, cwd)) return;

      if (!ctx.hasUI) {
        return { block: true, reason: `Blocked ${toolName} outside working directory (${targetPath})` };
      }

      const choice = await ctx.ui.select(
        `🔒 ${toolName} outside working directory:\n\n  ${targetPath}\n\nAllow?`,
        ["Allow", "Deny"],
      );

      if (choice !== "Allow") {
        return { block: true, reason: `User denied ${toolName} outside working directory` };
      }
      return;
    }

    // Intercept bash tools
    if (toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    // Interpreters and shell indirection can write anywhere, even when visible paths are inside cwd.
    if (hasDynamicShell(command) || isScriptInterpreter(command)) {
      if (!ctx.hasUI) {
        return { block: true, reason: `Blocked script interpreter command` };
      }

      const choice = await ctx.ui.select(
        `🔒 Command may write outside working directory:\n\n  ${command}\n\nAllow?`,
        ["Allow", "Deny"],
      );

      if (choice !== "Allow") {
        return { block: true, reason: `User denied potentially mutating command` };
      }
      return;
    }

    const outside = await hasOutsidePath(command, cwd);
    const readOnly = isReadOnlyCommand(command);
    // Fail closed: only explicitly safe commands bypass. Unknown commands prompt everywhere.
    if ((outside && readOnly) || (!outside && isSafeCwdCommand(command))) return;

    if (!ctx.hasUI) {
      return { block: true, reason: `Blocked bash command requiring permission` };
    }

    const choice = await ctx.ui.select(
      `🔒 Bash command requires permission:\n\n  ${command || "(empty or undefined command)"}\n\nAllow?`,
      ["Allow", "Deny"],
    );

    if (choice !== "Allow") {
      return { block: true, reason: `User denied bash command requiring permission` };
    }
  });
}

const GLOBAL_SETTINGS_PATH = resolve(homedir(), ".pi/agent/settings.json");
const LOCAL_SETTINGS_PATH = resolve(process.cwd(), ".pi/settings.json");

async function loadConfig(): Promise<CwdEditConfig> {
  for (const settingsPath of [LOCAL_SETTINGS_PATH, GLOBAL_SETTINGS_PATH]) {
    try {
      const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
      if (settings.cwdEdit) return settings;
    } catch { /* ignore */ }
  }

  return {};
}

async function saveConfig(config: CwdEditConfig): Promise<void> {
  let settingsPath = GLOBAL_SETTINGS_PATH;
  try {
    const local = JSON.parse(await readFile(LOCAL_SETTINGS_PATH, "utf-8"));
    if (local.cwdEdit) settingsPath = LOCAL_SETTINGS_PATH;
  } catch { /* ignore */ }

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf-8"));
  } catch { /* ignore */ }

  settings.cwdEdit = {
    ...(typeof settings.cwdEdit === "object" && settings.cwdEdit ? settings.cwdEdit : {}),
    ...config.cwdEdit,
  };
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

const SHELL_OPERATORS = new Set([";", "&&", "||", "|", "&"]);
const REDIRECT_OPERATORS = new Set([">", ">>", "&>", ">&"]);

function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;

  const flush = () => {
    if (current) tokens.push(current);
    current = "";
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote === "'") {
      if (char === "'") quote = undefined;
      else current += char;
      continue;
    }

    if (quote === '"') {
      if (char === '"') quote = undefined;
      else if (char === "\\") escaped = true;
      else current += char;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (";|&><".includes(char)) {
      flush();
      const next = command[i + 1];
      if ((char === "&" && (next === "&" || next === ">"))
        || (char === "|" && next === "|")
        || (char === ">" && (next === ">" || next === "&"))
        || (char === "<" && next === "<")) {
        tokens.push(char + next);
        i++;
      } else {
        tokens.push(char);
      }
      continue;
    }
    current += char;
  }

  if (escaped) current += "\\";
  flush();
  return tokens;
}

function extractPathTokens(command: string): string[] {
  const tokens = tokenizeShell(command);
  const paths: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (REDIRECT_OPERATORS.has(token) || token === "<" || token === "<<") {
      const target = tokens[i + 1];
      if (target && !target.startsWith("-") && !isHarmlessRedirectTarget(target)) paths.push(target);
      continue;
    }
    if (SHELL_OPERATORS.has(token) || token === "<") continue;

    const candidates = [token];
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 0) candidates.push(token.slice(equalsIndex + 1));

    for (const candidate of candidates) {
      if (isPathToken(candidate)) paths.push(candidate);
    }
  }

  return [...new Set(paths)];
}

function isPathToken(token: string): boolean {
  if (!token || /^(?:https?|ssh|git):\/\//i.test(token)) return false;
  if (token === "/dev/null" || token.startsWith("/dev/fd/")) return false;
  if (/^[/~$]/.test(token)) return true;
  if (/^(?:\.\.?)(?:\/|$)/.test(token)) return true;
  return /^[\w.-]+\/[\w.-]+/.test(token);
}

function resolveInputPath(rawPath: string, cwd: string): string | undefined {
  // Match Pi built-in path handling: leading @ is a display/input prefix, not part of path.
  const clean = rawPath.trim().replace(/^["']+|["']+$/g, "").replace(/^@/, "");
  return resolvePathToken(clean, cwd);
}

function resolvePathToken(token: string, cwd: string): string | undefined {
  if (!token || /^(?:https?|ssh|git):\/\//i.test(token)) return;

  if (token === "~" || token.startsWith("~/")) {
    return resolve(homedir(), token === "~" ? "" : token.slice(2));
  }
  if (token.startsWith("~")) return;

  const variable = token.match(/^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))(\/.*)?$/);
  if (variable) {
    const name = variable[1] ?? variable[2]!;
    const value = process.env[name];
    if (!value) return;
    return resolve(value, variable[3]?.slice(1) ?? "");
  }
  if (token.startsWith("$")) return;

  return resolve(cwd, token);
}

async function hasOutsidePath(command: string, cwd: string): Promise<boolean> {
  for (const token of extractPathTokens(command)) {
    const path = resolvePathToken(token, cwd);
    if (!path || !(await isPathInsideCwd(path, cwd))) return true;
  }
  return false;
}

async function isPathInsideCwd(targetPath: string, cwd: string): Promise<boolean> {
  if (!isLexicallyInside(targetPath, cwd)) return false;

  const [realCwd, realTarget] = await Promise.all([
    realpath(cwd).catch(() => cwd),
    realPathWithMissingParts(targetPath),
  ]);
  return isLexicallyInside(realTarget, realCwd);
}

function isLexicallyInside(targetPath: string, cwd: string): boolean {
  return targetPath === cwd || targetPath.startsWith(cwd + "/");
}

async function realPathWithMissingParts(targetPath: string): Promise<string> {
  const missingParts: string[] = [];
  let current = targetPath;

  while (true) {
    try {
      const existing = await realpath(current);
      return missingParts.reduceRight((parent, part) => resolve(parent, part), existing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return targetPath;
      missingParts.unshift(basename(current));
      current = parent;
    }
  }
}

function splitShellSegments(command: string): string[][] {
  const segments: string[][] = [[]];
  for (const token of tokenizeShell(command)) {
    if (SHELL_OPERATORS.has(token)) segments.push([]);
    else segments[segments.length - 1]!.push(token);
  }
  return segments.filter((segment) => segment.length > 0);
}

function isReadOnlyCommand(command: string): boolean {
  if (hasOutputRedirect(command)) return false;
  const segments = splitShellSegments(command);
  return segments.length > 0 && segments.every(isReadOnlySegment);
}

function hasOutputRedirect(command: string): boolean {
  return hasOutputRedirectInTokens(tokenizeShell(command));
}

function hasOutputRedirectInTokens(tokens: string[]): boolean {
  return tokens.some((token, index) => {
    if (!REDIRECT_OPERATORS.has(token)) return false;
    const target = tokens[index + 1];
    return Boolean(target && !isHarmlessRedirectTarget(target));
  });
}

function isHarmlessRedirectTarget(target: string): boolean {
  return target === "/dev/null" || target.startsWith("/dev/fd/");
}

const READ_ONLY_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "grep", "rg", "find", "fd", "bat", "eza", "less", "more",
  "cd", "pwd", "echo", "printf", "wc", "sort", "uniq", "diff", "file", "stat", "du", "df",
  "tree", "which", "whereis", "type", "printenv", "uname", "whoami", "id", "date", "cal",
  "uptime", "ps", "top", "htop", "free", "readlink", "realpath", "true", "false",
]);

function isReadOnlySegment(tokens: string[]): boolean {
  if (hasOutputRedirectInTokens(tokens)) return false;

  const command = commandName(tokens[0]!);
  if (READ_ONLY_COMMANDS.has(command)) return true;
  if (command === "git") return isReadOnlyGit(tokens);
  if (command === "gh") return isReadOnlyGh(tokens);
  if (["npm", "pnpm", "yarn"].includes(command)) return isReadOnlyPackageManager(tokens);
  return false;
}

function commandName(token: string): string {
  return basename(token.replace(/^["']+|["']+$/g, ""));
}

const OPTIONS_WITH_VALUES = new Set([
  "-C", "-c", "-X", "-u", "-H", "--git-dir", "--work-tree", "--namespace", "--prefix",
  "--repo", "--hostname", "--jq", "--template", "--limit", "--state", "--json", "--method",
]);

function positionalArgs(tokens: string[]): string[] {
  const args: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.startsWith("-")) {
      if (OPTIONS_WITH_VALUES.has(token)) i++;
      continue;
    }
    args.push(token);
  }
  return args;
}

function firstSubcommand(tokens: string[]): string | undefined {
  return positionalArgs(tokens)[0];
}

function isReadOnlyGit(tokens: string[]): boolean {
  return new Set([
    "status", "log", "diff", "show", "branch", "tag", "remote", "rev-parse", "ls-files",
    "ls-tree", "describe", "shortlog", "reflog", "check-ignore", "cat-file", "for-each-ref",
  ]).has(firstSubcommand(tokens) ?? "");
}

function isReadOnlyGh(tokens: string[]): boolean {
  const [subcommand, action] = positionalArgs(tokens);
  if (subcommand === "api") {
    return !tokens.some((token, index) =>
      (token === "-X" || token === "--method") && tokens[index + 1]?.toUpperCase() !== "GET");
  }
  if (subcommand === "pr") return ["view", "list", "diff", "checks", "status"].includes(action ?? "");
  if (subcommand === "issue") return ["view", "list", "status"].includes(action ?? "");
  if (subcommand === "repo") return action === "view";
  if (subcommand === "run") return ["view", "list"].includes(action ?? "");
  if (subcommand === "release") return ["view", "list"].includes(action ?? "");
  return false;
}

function isReadOnlyPackageManager(tokens: string[]): boolean {
  const [subcommand, action] = positionalArgs(tokens);
  if (["list", "ls", "view", "info", "search", "outdated", "audit"].includes(subcommand ?? "")) return true;
  return subcommand === "config" && ["get", "list"].includes(action ?? "");
}

const CWD_WRITE_COMMANDS = new Set([
  "mkdir", "touch", "cp", "mv", "rm", "rmdir", "ln", "install", "chmod", "chown", "tee", "sed",
  "awk", "tar", "unzip", "zip", "patch", "apply_patch", "echo", "printf", "cat", "head", "tail",
]);

const LOCAL_GIT_WRITE_COMMANDS = new Set([
  "add", "am", "apply", "branch", "checkout", "cherry-pick", "clean", "clone", "commit", "fetch",
  "init", "merge", "mv", "pull", "push", "rebase", "reset", "restore", "revert", "rm", "stash",
  "switch", "tag", "worktree",
]);

function isSafeCwdCommand(command: string): boolean {
  const segments = splitShellSegments(command);
  if (segments.length === 0) return false;

  return segments.every((tokens) => {
    if (isReadOnlySegment(tokens)) return true;
    const name = commandName(tokens[0]!);
    if (CWD_WRITE_COMMANDS.has(name)) return true;
    if (name !== "git") return false;
    const subcommand = firstSubcommand(tokens);
    if (subcommand !== "config") return LOCAL_GIT_WRITE_COMMANDS.has(subcommand ?? "");
    return !tokens.some((token) => token === "--global" || token === "--system");
  });
}

const SCRIPT_INTERPRETERS = new Set([
  "node", "deno", "bun", "python", "python3", "py", "ruby", "rb", "perl", "php", "lua", "rscript", "awk", "gawk", "mawk",
  "bash", "sh", "zsh", "fish", "dash", "ksh", "tcsh", "source", "sudo", "env", "command", "exec", "eval",
  "go", "cargo", "rustc", "tsc", "make", "cmake", "gcc", "g++", "cc", "clang", "java", "javac",
  "dotnet", "swift", "swiftc", "gradle", "mvn", "npm", "pnpm", "yarn", "pip", "pip3", "uv", "poetry",
  "xargs", "parallel", "watch", "docker", "podman", "ssh", "scp", "rsync", "ed", "ex", "vi", "vim", "nvim",
]);

function isScriptInterpreter(command: string): boolean {
  for (const segment of splitShellSegments(command)) {
    const firstToken = segment[0] ?? "";
    if (firstToken === "." || firstToken === "source" || firstToken.startsWith("./") || firstToken.startsWith("../")) return true;
    if (SCRIPT_INTERPRETERS.has(commandName(firstToken))) return true;
  }
  return false;
}

function hasDynamicShell(command: string): boolean {
  return /\$\(|`|[<>]\(|\beval\b|\bfind\b.*\s-exec(?:dir)?\b/i.test(command);
}
