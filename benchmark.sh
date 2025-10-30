#!/bin/bash
echo "Testing Rust version performance..."
start=$(date +%s%N)
echo "hi" | timeout 5s ./target/release/claude-yes --exit-on-idle 2s > /dev/null 2>&1
end=$(date +%s%N)
rust_time=$((($end - $start) / 1000000))
echo "Rust version: ${rust_time}ms"