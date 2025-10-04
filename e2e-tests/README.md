# Claude-Yes E2E Tests

End-to-end tests for comparing Rust and TypeScript implementations of claude-yes.

## Structure

```
e2e-tests/
├── vite-project/          # Test Vite project
│   ├── package.json
│   ├── index.html
│   ├── main.js
│   └── vite.config.js
├── run-tests.js           # Main test runner
├── vite-dev-test.js       # Specific Vite dev server test
├── test-config.json       # Test configuration
└── package.json
```

## Setup

```bash
cd e2e-tests
npm install
npm run setup  # Install vite-project dependencies
```

## Running Tests

### Run all tests for both implementations:

```bash
npm test
```

### Test specific implementation:

```bash
npm run test:rust       # Test Rust implementation
npm run test:typescript # Test TypeScript implementation
```

### Test Vite dev server functionality:

```bash
npm run test:vite       # Test both implementations with Vite
```

## Test Cases

### 1. Vite Dev Server Test

Tests that claude-yes can:

- Start a Vite dev server automatically
- Handle trust prompts automatically
- Verify the server is accessible
- Exit properly when the server starts

### 2. Basic Functionality Tests

- Help command output
- Version command output
- Auto-response to prompts

## Configuration

Edit `test-config.json` to:

- Modify test timeouts
- Add new test cases
- Change expected outputs
- Configure implementation paths

## Expected Behavior

Both Rust and TypeScript implementations should:

1. Automatically respond to Claude's trust prompts
2. Successfully start the Vite dev server
3. Make the server accessible on localhost:3000
4. Exit cleanly after successful operations

## Troubleshooting

### Common Issues:

1. **Port 3000 already in use**: Kill existing processes on port 3000
2. **Dependencies not installed**: Run `npm run setup` first
3. **Binary not found**: Build the implementations first:

   ```bash
   # Build Rust version
   cargo build --release

   # Build TypeScript version
   npm run build:cli
   ```

### Debug Mode:

Add `--verbose` flag to claude-yes commands in test configuration for more detailed output.

## Adding New Tests

1. Add test configuration to `test-config.json`
2. Specify expected outputs and timeouts
3. Run tests to verify both implementations work correctly
