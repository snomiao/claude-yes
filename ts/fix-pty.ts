#!/usr/bin/env node

import { execSync } from 'child_process';
import { error } from 'console';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { arch, platform } from 'process';
import { fileURLToPath } from 'url';

// Determine the platform-specific library name
function getLibraryName() {
  switch (platform) {
    case 'win32':
      return 'rust_pty.dll';
    case 'darwin':
      return arch === 'arm64' ? 'librust_pty_arm64.dylib' : 'librust_pty.dylib';
    case 'linux':
      return arch === 'arm64' ? 'librust_pty_arm64.so' : 'librust_pty.so';
    default:
      return 'librust_pty.so';
  }
}

// Check if we need to rebuild bun-pty
const bunPtyPath =
  dirname(fileURLToPath(import.meta.resolve('@snomiao/bun-pty'))) + '/..';
const libName = getLibraryName();
const libPath = join(bunPtyPath, 'rust-pty', 'target', 'release', libName);

if (!existsSync(bunPtyPath)) {
  console.log({ bunPtyPath });
  console.log('bun-pty not found, skipping fix-pty in ');
  process.exit(0);
}

// Platform-specific compatibility check
if (platform === 'linux') {
  // Check if the binary exists and if it has GLIBC compatibility issues
  try {
    const lddOutput = execSync(`ldd "${libPath}" 2>&1`, { encoding: 'utf8' });
    if (lddOutput.includes('GLIBC') && lddOutput.includes('not found')) {
      console.log('GLIBC compatibility issue detected, rebuilding bun-pty...');
      rebuildBunPty();
    } else {
      console.log('bun-pty binary is compatible');
    }
  } catch (error) {
    // If ldd fails or file doesn't exist, try to rebuild
    console.log('Checking bun-pty compatibility...');
    rebuildBunPty();
  }
} else if (platform === 'win32') {
  // Windows: Check if DLL exists
  if (!existsSync(libPath)) {
    console.log('Windows DLL not found, attempting to rebuild...');
    rebuildBunPty();
  } else {
    console.log('bun-pty Windows DLL found');
  }
} else if (platform === 'darwin') {
  // macOS: Check if dylib exists
  if (!existsSync(libPath)) {
    console.log('macOS dylib not found, attempting to rebuild...');
    rebuildBunPty();
  } else {
    console.log('bun-pty macOS dylib found');
  }
} else {
  console.log(`Platform ${platform} may require manual configuration`);
}

function rebuildBunPty() {
  try {
    // Check if cargo is available
    const cargoCmd = platform === 'win32' ? 'cargo.exe' : 'cargo';
    try {
      execSync(`${cargoCmd} --version`, { stdio: 'ignore' });
    } catch {
      console.warn(
        'Warning: Rust/Cargo not found. bun-pty native module may not work.',
      );
      console.warn('To fix this, install Rust: https://rustup.rs/');
      return;
    }

    const rustPtyDir = join(bunPtyPath, 'rust-pty');
    const isWindows = platform === 'win32';
    const tempBase = isWindows ? process.env.TEMP || 'C:\\Temp' : '/tmp';

    // Check if source code exists
    if (!existsSync(join(rustPtyDir, 'Cargo.toml'))) {
      // Try to clone and build from source
      console.log(
        'Source code not found in npm package, cloning from repository...',
      );
      const tmpDir = join(tempBase, `bun-pty-build-${Date.now()}`);

      try {
        execSync(
          `git clone https://github.com/snomiao/bun-pty.git "${tmpDir}"`,
          { stdio: 'inherit' },
        );

        // Build command varies by platform
        if (isWindows) {
          execSync(
            `cd /d "${tmpDir}" && cargo build --release --manifest-path rust-pty\\Cargo.toml`,
            { stdio: 'inherit' },
          );
        } else {
          execSync(
            `cd "${tmpDir}" && cargo build --release --manifest-path rust-pty/Cargo.toml`,
            { stdio: 'inherit' },
          );
        }

        // Copy the built library
        const builtLib = join(tmpDir, 'rust-pty', 'target', 'release', libName);
        if (existsSync(builtLib)) {
          // Ensure target directory exists
          const targetDir = join(rustPtyDir, 'target', 'release');
          if (isWindows) {
            execSync(`if not exist "${targetDir}" mkdir "${targetDir}"`, {});
            execSync(`copy /Y "${builtLib}" "${libPath}"`, {});
          } else {
            execSync(`mkdir -p "${targetDir}"`, { stdio: 'inherit' });
            execSync(`cp "${builtLib}" "${libPath}"`, { stdio: 'inherit' });
          }
          console.log('Successfully rebuilt bun-pty native module');
        }

        // Cleanup
        if (isWindows) {
          execSync(`rmdir /s /q "${tmpDir}"`, { stdio: 'ignore' });
        } else {
          execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' });
        }
      } catch (buildError) {
        console.error(
          'Failed to build bun-pty:',
          buildError instanceof Error ? buildError.message : buildError,
        );
        console.warn('The application may not work correctly without bun-pty');
      }
    } else {
      // Build from included source
      console.log('Building bun-pty from source...');
      if (isWindows) {
        execSync(`cd /d "${rustPtyDir}" && cargo build --release`, {
          stdio: 'inherit',
        });
      } else {
        execSync(`cd "${rustPtyDir}" && cargo build --release`, {
          stdio: 'inherit',
        });
      }
      console.log('Successfully rebuilt bun-pty native module');
    }
  } catch (error) {
    console.error(
      'Failed to rebuild bun-pty:',
      error instanceof Error ? error.message : error,
    );
    console.warn('The application may not work correctly without bun-pty');
  }
}
