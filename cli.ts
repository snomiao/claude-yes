#!/usr/bin/env node
import yesClaude from ".";

// cli entry point
const rawArgs = process.argv.slice(2);
const exitOnIdleFlag = "--exit-on-idle"
const exitOnIdle = rawArgs.includes(exitOnIdleFlag); // check if --exit-on-idle flag is passed
const claudeArgs = (rawArgs).filter(e => e !== exitOnIdleFlag); // remove --exit-on-idle flag if exists

await yesClaude({
    exitOnIdle,
    claudeArgs
});