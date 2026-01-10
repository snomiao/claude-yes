#!/usr/bin/env bun
import { execaCommand } from "execa";
import { chmod, copyFile, mkdir } from "fs/promises";
import path from "path";
import { CLIS_CONFIG } from "./index";

const distDir = path.join(process.cwd(), "dist");
const binariesDir = path.join(distDir, "bin");

// Create binaries directory
await mkdir(binariesDir, { recursive: true });

console.log("Building binary for current platform...");

// Detect current platform
const platform = process.platform;
const arch = process.arch;

console.log(`Platform: ${platform}-${arch}`);

// Build main CLI binary
const outputName = platform === "win32" ? "agent-yes.exe" : "agent-yes";
const outputPath = path.join(binariesDir, outputName);

try {
  await execaCommand(`bun build ts/cli.ts --compile --outfile=${outputPath}`, {
    stdio: "inherit",
  });

  // Make executable on Unix-like systems
  if (platform !== "win32") {
    await chmod(outputPath, 0o755);
  }

  console.log(`✓ Built ${outputPath}`);

  // Create symlinks/copies for each CLI variant
  const cliTools = Object.keys(CLIS_CONFIG);
  for (const cli of cliTools) {
    const variantName = platform === "win32" ? `${cli}-yes.exe` : `${cli}-yes`;
    const variantPath = path.join(binariesDir, variantName);

    // Copy the main binary
    await copyFile(outputPath, variantPath);

    // Make executable on Unix-like systems
    if (platform !== "win32") {
      await chmod(variantPath, 0o755);
    }

    console.log(`  ✓ Created ${variantName}`);
  }

  console.log(`\n✓ Binary build complete! Binaries are in ${binariesDir}/`);
  console.log(`\nTo use the binaries, add to your PATH:`);
  console.log(`  export PATH="${binariesDir}:$PATH"`);
} catch (error) {
  console.error("✗ Failed to build binary:", error);
  process.exit(1);
}
