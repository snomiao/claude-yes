#!/bin/bash
echo "Testing immediate input forwarding..."
echo "Type some characters (they should appear immediately without pressing Enter)"
echo "Press Ctrl+C to exit"
./target/release/claude-yes --exit-on-idle 30s -- "echo 'Type something:'; read input; echo You typed: \$input"