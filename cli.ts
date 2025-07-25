#!/usr/bin/env bun
import ms from "enhanced-ms";
import minimist from "minimist";
import claudeYes from ".";

// cli entry point
const args = minimist(process.argv.slice(2), {
  string: ["exit-on-idle"],
  boolean: ["continue-on-crash"],
  // boolean: ['exit-on-idle'],
  default: {
    "exit-on-idle": "60s",
    "continue-on-crash": true,
  },
});

const {
  "exit-on-idle": exitOnIdleArg,
  "continue-on-crash": continueOnCrashArg,
  ...rest
} = args;
const claudeArgs = Object.entries(rest).flatMap(([key, value]) => {
  if (key === "_") return value as string[];
  if (typeof value === "boolean") return value ? [`--${key}`] : [];
  return [`--${key}`, String(value)];
});

let exitOnIdle: boolean | number | undefined;
if (typeof exitOnIdleArg === "string") {
  if (exitOnIdleArg === "") {
    exitOnIdle = true; // default timeout will be used
  } else {
    exitOnIdle = ms(exitOnIdleArg); // parse duration string like "5s", "30s", "1m"
  }
} else {
  exitOnIdle = undefined;
}

// console.debug('Parsed args:', {
//     exitOnIdle,
//     continueOnCrash: continueOnCrashArg,
//     claudeArgs,
// });

await claudeYes({
  exitOnIdle,
  claudeArgs,
  continueOnCrash: continueOnCrashArg,
});
