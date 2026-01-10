#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

process.stdout.write("> Ready for input\n");

let buffer = "";

async function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed === "/exit") {
    process.stdout.write("Exiting on request\n");
    process.exit(0);
    return;
  }

  const match = trimmed.match(/into\s+(\S+)\s+and\s+wait/i);
  if (!match) return;

  const target = match[1].replace(/^['"]|['"]$/g, "");
  const targetPath = path.resolve(process.cwd(), target);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify({ on: 1 }));
  process.stdout.write(`Mock agent wrote ${target}\n`);
  setTimeout(() => process.exit(0), 200);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const parts = buffer.split(/\r?\n/);
  buffer = parts.pop() ?? "";
  parts.forEach((line) => {
    void handleLine(line).catch((error) => {
      console.error("Mock agent failed:", error);
      process.exitCode = 1;
    });
  });
});
