#!/usr/bin/env node

import { exec, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class UnifiedCompatibilityTest {
  constructor() {
    this.implementations = {
      typescript: {
        name: 'TypeScript',
        binary: path.join(__dirname, '../dist/claude-yes.js'),
        buildCommand: 'npm run build:cli',
        executor: 'node',
      },
      rust: {
        name: 'Rust',
        binary: path.join(__dirname, '../target/release/claude-yes'),
        buildCommand: 'cargo build --release',
        executor: null, // direct binary execution
      },
    };
    this.results = [];
  }

  async buildImplementations() {
    console.log('🔨 Building implementations...\n');

    for (const [key, impl] of Object.entries(this.implementations)) {
      try {
        console.log(`Building ${impl.name}...`);
        await execAsync(impl.buildCommand, {
          cwd: path.join(__dirname, '..'),
        });
        console.log(`✅ ${impl.name} build complete`);
      } catch (error) {
        console.error(`❌ Failed to build ${impl.name}: ${error.message}`);
        throw error;
      }
    }
    console.log('');
  }

  async runCommand(impl, args, options = {}) {
    return new Promise((resolve, reject) => {
      const { timeout = 5000, input = null } = options;

      const command = impl.executor ? impl.executor : impl.binary;
      const cmdArgs = impl.executor ? [impl.binary, ...args] : args;

      const child = spawn(command, cmdArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const startTime = Date.now();

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Send input if provided
      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          stdout,
          stderr,
          exitCode: null,
          timeout: true,
          duration: Date.now() - startTime,
        });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code,
          timeout: false,
          duration: Date.now() - startTime,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  normalizeOutput(output) {
    // Remove version numbers and paths that might differ
    return output
      .replace(/\d+\.\d+\.\d+/g, 'X.X.X')
      .replace(/\/[^\s]+\/claude-yes/g, '/PATH/claude-yes')
      .replace(/\\[^\s]+\\claude-yes/g, '\\PATH\\claude-yes')
      .trim();
  }

  async testCompatibility(testName, args, options = {}) {
    console.log(`🧪 Testing: ${testName}`);

    const results = {};
    for (const [key, impl] of Object.entries(this.implementations)) {
      try {
        const result = await this.runCommand(impl, args, options);
        results[key] = result;
        console.log(
          `  ${impl.name}: exit=${result.exitCode}, timeout=${result.timeout}, duration=${result.duration}ms`,
        );
      } catch (error) {
        console.error(`  ❌ ${impl.name} error: ${error.message}`);
        results[key] = { error: error.message };
      }
    }

    // Compare outputs
    const tsResult = results.typescript;
    const rsResult = results.rust;

    const compatibility = {
      testName,
      args: args.join(' '),
      passed: true,
      details: {},
    };

    // Check exit codes match
    if (tsResult.exitCode !== rsResult.exitCode) {
      compatibility.passed = false;
      compatibility.details.exitCode = {
        typescript: tsResult.exitCode,
        rust: rsResult.exitCode,
      };
    }

    // Check timeout behavior matches
    if (tsResult.timeout !== rsResult.timeout) {
      compatibility.passed = false;
      compatibility.details.timeout = {
        typescript: tsResult.timeout,
        rust: rsResult.timeout,
      };
    }

    // Check output similarity (normalized)
    if (options.checkOutput !== false) {
      const tsOutput = this.normalizeOutput(tsResult.stdout + tsResult.stderr);
      const rsOutput = this.normalizeOutput(rsResult.stdout + rsResult.stderr);

      // Check if key content matches
      if (options.expectedContent) {
        const tsHasContent = options.expectedContent.every((content) =>
          tsOutput.includes(content),
        );
        const rsHasContent = options.expectedContent.every((content) =>
          rsOutput.includes(content),
        );

        if (tsHasContent !== rsHasContent) {
          compatibility.passed = false;
          compatibility.details.content = {
            typescript: tsHasContent,
            rust: rsHasContent,
            expected: options.expectedContent,
          };
        }
      }
    }

    const status = compatibility.passed ? '✅' : '❌';
    console.log(
      `  ${status} Compatibility: ${compatibility.passed ? 'PASS' : 'FAIL'}`,
    );

    if (!compatibility.passed) {
      console.log('  Details:', JSON.stringify(compatibility.details, null, 2));
    }

    console.log('');
    this.results.push({ ...compatibility, tsResult, rsResult });
    return compatibility;
  }

  async runAllTests() {
    console.log('🚀 Starting Unified Compatibility Tests\n');
    console.log(
      'Testing bug-to-bug compatibility between TypeScript and Rust implementations\n',
    );

    try {
      await this.buildImplementations();

      // Test 1: Help command
      await this.testCompatibility('Help command', ['--help'], {
        expectedContent: ['claude-yes', 'help'],
        checkOutput: true,
      });

      // Test 2: Version command
      await this.testCompatibility('Version command', ['--version'], {
        expectedContent: ['claude-yes'],
        checkOutput: true,
      });

      // Test 3: Invalid argument
      await this.testCompatibility('Invalid argument', ['--invalid-flag'], {
        checkOutput: false,
      });

      // Test 4: Echo command (simple execution)
      await this.testCompatibility(
        'Simple echo command',
        ['--', 'echo', 'test'],
        {
          expectedContent: ['test'],
          timeout: 3000,
        },
      );

      // Test 5: Exit code propagation
      await this.testCompatibility(
        'Exit code propagation',
        ['--', 'sh', '-c', 'exit 42'],
        {
          checkOutput: false,
          timeout: 3000,
        },
      );

      // Test 6: Multiple arguments
      await this.testCompatibility(
        'Multiple arguments',
        ['--', 'echo', 'arg1', 'arg2', 'arg3'],
        {
          expectedContent: ['arg1', 'arg2', 'arg3'],
          timeout: 3000,
        },
      );

      this.printSummary();
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  printSummary() {
    console.log('📊 Test Summary\n');

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('');

    if (failed > 0) {
      console.log('Failed Tests:');
      this.results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.testName}: ${r.args}`);
          console.log(`    Details: ${JSON.stringify(r.details, null, 2)}`);
        });
      console.log('');
    }

    const success = failed === 0;
    console.log(
      success
        ? '🎉 All compatibility tests passed!'
        : '⚠️  Some compatibility tests failed',
    );
    console.log('');

    process.exit(success ? 0 : 1);
  }
}

// Run tests
const test = new UnifiedCompatibilityTest();
test.runAllTests().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
