#!/usr/bin/env bun
import { execaCommand } from 'execa';
import { mkdir } from 'fs/promises';
import path from 'path';
import { CLIS_CONFIG } from './index';

const platforms = ['linux', 'darwin', 'windows'] as const;
const archs = ['x64', 'arm64'] as const;

const distDir = path.join(process.cwd(), 'dist');
const binariesDir = path.join(distDir, 'binaries');

// Create binaries directory
await mkdir(binariesDir, { recursive: true });

console.log('Building binaries for all platforms...');

// Build for each CLI tool
const cliTools = Object.keys(CLIS_CONFIG);

for (const platform of platforms) {
  for (const arch of archs) {
    const targetTriple = `${platform}-${arch}`;
    console.log(`\nBuilding for ${targetTriple}...`);

    // Build main CLI binary
    const cliOutputName =
      platform === 'windows' ? 'agent-yes.exe' : 'agent-yes';
    const cliOutputPath = path.join(
      binariesDir,
      `${targetTriple}`,
      cliOutputName,
    );

    try {
      await execaCommand(
        `bun build ts/cli.ts --compile --target=bun-${platform}-${arch} --outfile=${cliOutputPath}`,
        { stdio: 'inherit' },
      );
      console.log(`✓ Built ${cliOutputPath}`);

      // Create symlinks/copies for each CLI variant
      for (const cli of cliTools) {
        const variantName =
          platform === 'windows' ? `${cli}-yes.exe` : `${cli}-yes`;
        const variantPath = path.join(
          binariesDir,
          `${targetTriple}`,
          variantName,
        );

        // On Unix-like systems, create symlinks; on Windows, copy the file
        if (platform === 'windows') {
          await Bun.write(
            variantPath,
            await Bun.file(cliOutputPath).arrayBuffer(),
          );
        } else {
          // Create a wrapper script that calls the main binary
          const wrapperScript = `#!/bin/sh\nexec "$(dirname "$0")/agent-yes" "$@"\n`;
          await Bun.write(variantPath, wrapperScript);
          await execaCommand(`chmod +x ${variantPath}`);
        }
        console.log(`  ✓ Created ${variantName}`);
      }
    } catch (error) {
      console.error(`✗ Failed to build for ${targetTriple}:`, error);
    }
  }
}

console.log('\n✓ Binary builds complete! Binaries are in dist/binaries/');
