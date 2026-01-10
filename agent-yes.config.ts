import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defineCliYesConfig } from "./ts/defineConfig.ts";

if (process.env.VERBOSE) console.log("loading cli-yes.config.ts from " + import.meta.url);

// For config path,
// 1. if run in ts (means in dev mode), igmport.meta.file.endsWith('.ts'), then use ./ as config dir
// 2. and then default to ~/.agent-yes config, try to mkdir logs to that to find out if we have permission to write it
// 3. and then fallback to a workspace-local ./node_modules/.agent-yes config directory so it works in sandboxed envs

// Helper function to test if we can write to a directory
async function canWriteToDir(dir: string): Promise<boolean> {
  try {
    await mkdir(path.join(dir, "logs"), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// Determine config directory with 3-tier fallback
const configDir = await (async () => {
  // 1. If running in dev mode (ts file), use current directory
  const isDevMode = import.meta.url.endsWith(".ts");
  if (isDevMode) {
    const devConfigDir = path.resolve(process.cwd(), ".agent-yes");
    if (process.env.VERBOSE) console.log("[config] Dev mode detected, using:", devConfigDir);
    return devConfigDir;
  }

  // 2. Try ~/.agent-yes as default
  const homeConfigDir = path.resolve(os.homedir(), ".agent-yes");
  if (await canWriteToDir(homeConfigDir)) {
    if (process.env.VERBOSE) console.log("[config] Using home directory:", homeConfigDir);
    return homeConfigDir;
  } else {
    if (process.env.VERBOSE)
      console.log("[config] Cannot write to home directory, falling back to workspace");
  }

  // 3. Fallback to workspace-local ./node_modules/.agent-yes for sandboxed envs
  const workspaceConfigDir = path.resolve(process.cwd(), "node_modules", ".agent-yes");
  if (process.env.VERBOSE) console.log("[config] Using workspace directory:", workspaceConfigDir);
  return workspaceConfigDir;
})();

// For logs, use configDir/logs
const logsDir = path.resolve(configDir, "logs");

export default defineCliYesConfig({
  configDir,
  logsDir,
  clis: {
    qwen: {
      install: "npm install -g @qwen-code/qwen-code@latest",
      version: "qwen --version",
    },
    grok: {
      install: "npm install -g @vibe-kit/grok-cli@latest",
      ready: [/^  │ ❯ +/],
      enter: [/^   1. Yes/],
    },
    claude: {
      promptArg: "last-arg",
      install: "npm install -g @anthropic-ai/claude-code@latest",
      // ready: [/^> /], // regex matcher for stdin ready
      ready: [/\? for shortcuts/], // regex matcher for stdin ready
      typeRespond: {
        "2\n": /2. Yes/,
      },
      enter: [/❯ +1\. Yes/, /❯ +1\. Dark mode✔/, /Press Enter to continue…/],
      fatal: [/⎿  Claude usage limit reached\./, /^error: unknown option/],
      restoreArgs: ["--continue"], // restart with --continue when crashed
      restartWithoutContinueArg: [/No conversation found to continue/],
      exitCommand: ["/exit"],
      bunx: true, // use bunx to run the binary, start time is 5s faster than node
      defaultArgs: ["--model=sonnet"], // default to sonnet, to prevent opus model overload
    },
    gemini: {
      install: "npm install -g @google/gemini-cli@latest",
      // match the agent prompt after initial lines; handled by index logic using line index
      ready: [/Type your message/], // used with line index check
      enter: [/│ ● 1. Yes, allow once/, /│ ● 1. Allow once/],
      fatal: [/Error resuming session/, /No previous sessions found for this project./],
      restoreArgs: ["--resume"], // restart with --resume when crashed
      restartWithoutContinueArg: [
        /No previous sessions found for this project\./,
        /Error resuming session/,
      ],
      exitCommand: ["/chat save ${PWD}", "/quit"],
    },
    codex: {
      promptArg: "first-arg",
      install: "npm install -g @openai/codex@latest",
      updateAvailable: [/^✨⬆️ Update available!/],
      ready: [
        /⏎ send/, // legacy
        /\? for shortcuts/, // 2026-01-05 update
      ],
      enter: [
        /> 1. Yes,/,
        /> 1. Yes, allow Codex to work in this folder/,
        /> 1. Approve and run now/,
      ],
      fatal: [/Error: The cursor position could not be read within/],
      // add to codex --search by default when not provided by the user
      defaultArgs: ["--search"],
      noEOL: true, // codex use cursor moving instead of EOL when rendering output
    },
    copilot: {
      // promptArg: '--prompt', // use stdin to prompt or it will reject all bash commands
      install: "npm install -g @github/copilot",
      ready: [/^ +> /, /Ctrl\+c Exit/],
      enter: [/ │ ❯ +1. Yes, proceed/, /❯ +1. Yes/],
      fatal: [],
    },
    cursor: {
      install: "open https://cursor.com/ja/docs/cli/installation",
      // map logical "cursor" cli name to actual binary name
      binary: "cursor-agent",
      bunx: true,
      ready: [/\/ commands/],
      enter: [/→ Run \(once\) \(y\) \(enter\)/, /▶ \[a\] Trust this workspace/],
      fatal: [/^  Error: You've hit your usage limit/],
    },
    auggie: {
      help: "https://docs.augmentcode.com/cli/overview",
      install: "npm install -g @augmentcode/auggie",
      promptArg: "first-arg",
      ready: [/ > /, /\? to show shortcuts/],
      enter: [], // auggie seems not to ask for permission currently, which is super nice
      fatal: [], // no fatal patterns known yet
    },
  },
});
