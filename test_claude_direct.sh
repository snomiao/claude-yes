#!/bin/bash

# Build the binary first
cargo build --release

# Run claude-yes with a simple command and increased logging
export RUST_LOG=info
timeout 30s ./target/release/claude-yes \
    --verbose \
    --log-file ./test-direct.log \
    --exit-on-idle 10s \
    -- "echo 'Hello World'"

echo "Exit code: $?"
echo "--- Log contents ---"
cat ./test-direct.log 2>/dev/null || echo "No log file"