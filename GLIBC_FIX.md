# Native Module Compatibility Fix

## Linux GLIBC Error

If you encounter a GLIBC version error like:

```
error: Failed to open library "...librust_pty.so":
/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.39' not found
```

## Windows DLL Error

If you encounter a missing DLL error on Windows:

```
error: Failed to open library "...rust_pty.dll": The specified module could not be found
```

## Solution

The package includes a postinstall script that automatically rebuilds the `bun-pty` native module on your system when you install the package. This ensures compatibility with your system's GLIBC version.

### Requirements

- **Rust/Cargo**: Required to rebuild the native module
  - Install from: https://rustup.rs/
  - Or via package manager: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### How it works

1. When you run `npm install` or `bun install`, the postinstall script automatically runs
2. It detects your platform (Windows/Linux/macOS) and architecture (x64/arm64)
3. Checks if the pre-built binary is compatible with your system
4. If incompatible or missing, it rebuilds the native module from source

### Manual rebuild

If the automatic rebuild fails, you can manually rebuild:

#### Linux/macOS:

```bash
# Clone bun-pty source
git clone https://github.com/sursaone/bun-pty.git /tmp/bun-pty-build

# Build the native module
cd /tmp/bun-pty-build
cargo build --release --manifest-path rust-pty/Cargo.toml

# Copy to your node_modules (Linux)
cp rust-pty/target/release/librust_pty.so \
   node_modules/bun-pty/rust-pty/target/release/librust_pty.so

# Copy to your node_modules (macOS)
cp rust-pty/target/release/librust_pty.dylib \
   node_modules/bun-pty/rust-pty/target/release/librust_pty.dylib
```

#### Windows:

```powershell
# Clone bun-pty source
git clone https://github.com/sursaone/bun-pty.git C:\Temp\bun-pty-build

# Build the native module
cd C:\Temp\bun-pty-build
cargo build --release --manifest-path rust-pty\Cargo.toml

# Copy to your node_modules
copy rust-pty\target\release\rust_pty.dll `
   node_modules\bun-pty\rust-pty\target\release\rust_pty.dll
```

### Alternative: Use node-pty

If you continue having issues with bun-pty, you can switch to node-pty which is already listed as a peer dependency:

```bash
npm install node-pty
```

The package will automatically use node-pty if bun-pty is not available.
