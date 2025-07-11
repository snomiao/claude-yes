#!/usr/bin/env node
import ms from "enhanced-ms";
import minimist from "minimist";
import yesClaude from ".";

// cli entry point
const args = minimist(process.argv.slice(2), {
    string: ['exit-on-idle'],
    // boolean: ['exit-on-idle'],
    default: {
        'exit-on-idle': undefined
    }
});

const { 'exit-on-idle': exitOnIdleArg, ...rest } = args;
const claudeArgs = Object.entries(rest).flatMap(([key, value]) => {
    if (key === '_') return value as string[];
    if (typeof value === 'boolean') return value ? [`--${key}`] : [];
    return [`--${key}`, String(value)];
});


let exitOnIdle: boolean | number | undefined;
if (exitOnIdleArg === true) {
    exitOnIdle = true; // default timeout will be used
} else if (typeof exitOnIdleArg === 'string') {
    if (exitOnIdleArg === '') {
        exitOnIdle = true; // default timeout will be used
    } else {
        exitOnIdle = ms(exitOnIdleArg); // parse duration string like "5s", "30s", "1m"
    }
} else {
    exitOnIdle = undefined;
}

await yesClaude({
    exitOnIdle,
    claudeArgs
});