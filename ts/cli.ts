#!/usr/bin/env bun
import { argv } from "process";
import cliYesConfig from "../agent-yes.config.ts";
import { parseCliArgs } from "./parseCliArgs.ts";
import { logger } from "./logger.ts";

// Import the CLI module

// Parse CLI arguments
const config = parseCliArgs(process.argv);

// Validate CLI name
if (!config.cli) {
  logger.error(process.argv)
  logger.error("Error: No CLI name provided.");
  throw new Error(`missing cli def, available clis: ${Object.keys((await cliYesConfig).clis).join(", ")}`);
}

// console.log(`Using CLI: ${config.cli}`);

if (config.verbose) {
  process.env.VERBOSE = "true"; // enable verbose logging in yesLog.ts
  console.log(config);
  console.log(argv);
}

const { default: cliYes } = await import("./index.ts");
const { exitCode } = await cliYes(config);
console.log("exiting process");
process.exit(exitCode ?? 1);
