import { defineCliYesConfig } from './ts/defineConfig';

process.env.VERBOSE &&
  console.log('loading cli-yes.config.ts from ' + import.meta.url);
export default defineCliYesConfig({
  clis: {
    qwen: {
      install: 'npm install -g @qwen-code/qwen-code@latest',
      version: 'qwen --version',
    },
    grok: {
      install: 'npm install -g @vibe-kit/grok-cli',
      ready: [/^  │ ❯ /],
      enter: [/^   1. Yes/],
    },
    claude: {
      promptArg: 'first-arg',
      install: 'npm install -g @anthropic-ai/claude-code',
      restoreArgs: ['--continue'],
      // ready: [/^> /], // regex matcher for stdin ready
      ready: [/\? for shortcuts/], // regex matcher for stdin ready
      enter: [/❯ 1. Yes/, /❯ 1. Dark mode✔/, /Press Enter to continue…/],
      fatal: [
        /No conversation found to continue/,
        /⎿  Claude usage limit reached\./,
      ],
      defaultArgs: ['--model=sonnet'], // default to sonnet, to prevent opus model overload
    },
    gemini: {
      install: 'npm install -g @google/gemini-cli',
      // match the agent prompt after initial lines; handled by index logic using line index
      ready: [/Type your message/], // used with line index check
      enter: [/│ ● 1. Yes, allow once/],
      fatal: [],
    },
    codex: {
      promptArg: 'first-arg',
      install: 'npm install -g @openai/codex-cli',
      ready: [/⏎ send/],
      enter: [
        /> 1. Yes, allow Codex to work in this folder/,
        /> 1. Approve and run now/,
      ],
      fatal: [/Error: The cursor position could not be read within/],
      // add to codex --search by default when not provided by the user
      defaultArgs: ['--search'],
      noEOL: true, // codex use cursor moving instead of EOL when rendering output
    },
    copilot: {
      promptArg: '--prompt',
      install: 'npm install -g @github/copilot',
      ready: [/^ +> /, /Ctrl\+c Exit/],
      enter: [/ │ ❯ 1. Yes, proceed/, /❯ 1. Yes/],
      fatal: [],
    },
    cursor: {
      install: 'open https://cursor.com/ja/docs/cli/installation',
      // map logical "cursor" cli name to actual binary name
      binary: 'cursor-agent',
      ready: [/\/ commands/],
      enter: [/→ Run \(once\) \(y\) \(enter\)/, /▶ \[a\] Trust this workspace/],
      fatal: [/^  Error: You've hit your usage limit/],
    },
  },
});
