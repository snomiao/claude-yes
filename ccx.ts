// ccx = claude code execution

import yesClaude from "."

const prompt = process.argv.slice(2)
console.log("Claude Code Exec: ", prompt.join(" "))

await yesClaude({ claudeArgs: [prompt.join(" ")], exitOnIdle: true })