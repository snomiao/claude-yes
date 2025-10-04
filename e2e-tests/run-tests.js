#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

class E2ETestRunner {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = null;
    this.results = [];
  }

  async loadConfig() {
    const configContent = await fs.readFile(this.configPath, 'utf-8');
    this.config = JSON.parse(configContent);
  }

  async setupTestProject() {
    console.log('📦 Setting up test project...');
    const projectPath = path.join(__dirname, this.config.testProject.path);

    try {
      // Check if package.json exists
      await fs.access(path.join(projectPath, 'package.json'));

      // Install dependencies
      console.log('Installing dependencies...');
      await execAsync('npm install', { cwd: projectPath });

      console.log('✅ Test project setup complete');
    } catch (error) {
      throw new Error(`Failed to setup test project: ${error.message}`);
    }
  }

  async buildImplementations() {
    console.log('🔨 Building implementations...');

    for (const [name, impl] of Object.entries(this.config.implementations)) {
      try {
        console.log(`Building ${name} implementation...`);
        if (name === 'rust') {
          await execAsync(impl.buildCommand, {
            cwd: path.join(__dirname, '..'),
          });
        } else if (name === 'typescript') {
          await execAsync(impl.buildCommand, {
            cwd: path.join(__dirname, '..'),
          });
        }
        console.log(`✅ ${name} build complete`);
      } catch (error) {
        console.error(`❌ Failed to build ${name}: ${error.message}`);
      }
    }
  }

  async runCommand(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          stdout,
          stderr,
          exitCode: null,
          timeout: true,
          duration: timeout,
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

      const startTime = Date.now();
    });
  }

  async testImplementation(implName, implementation) {
    console.log(`\\n🧪 Testing ${implName} implementation...`);
    const results = [];

    for (const test of this.config.tests) {
      console.log(`  Running test: ${test.name}`);

      let command;
      if (test.command.startsWith('cd ')) {
        // Handle directory change commands
        command = test.command;
      } else {
        // Prepend the implementation binary
        const binary =
          implName === 'rust'
            ? path.join(__dirname, implementation.binary)
            : implementation.binary;
        command = `${binary} ${test.command}`;
      }

      const result = await this.runCommand(command, test.timeout);

      // Check expected output
      const passed = test.expectedOutput
        ? test.expectedOutput.every(
            (expected) =>
              result.stdout.includes(expected) ||
              result.stderr.includes(expected)
          )
        : result.exitCode === 0;

      const testResult = {
        implementation: implName,
        testName: test.name,
        description: test.description,
        command,
        passed,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timeout: result.timeout,
        duration: result.duration,
      };

      results.push(testResult);

      console.log(
        `    ${passed ? '✅' : '❌'} ${test.name} (${result.duration}ms)`
      );
      if (!passed) {
        console.log(`       Expected: ${test.expectedOutput?.join(', ')}`);
        console.log(`       Got: ${result.stdout.slice(0, 100)}...`);
      }
    }

    return results;
  }

  async runAllTests() {
    console.log('🚀 Starting E2E tests for claude-yes\\n');

    await this.loadConfig();
    await this.setupTestProject();
    await this.buildImplementations();

    // Test each implementation
    for (const [implName, implementation] of Object.entries(
      this.config.implementations
    )) {
      const results = await this.testImplementation(implName, implementation);
      this.results.push(...results);
    }

    this.printSummary();
  }

  printSummary() {
    console.log('\\n📊 Test Summary\\n');

    const byImplementation = {};
    let totalPassed = 0;
    let totalTests = 0;

    for (const result of this.results) {
      if (!byImplementation[result.implementation]) {
        byImplementation[result.implementation] = { passed: 0, total: 0 };
      }
      byImplementation[result.implementation].total++;
      totalTests++;

      if (result.passed) {
        byImplementation[result.implementation].passed++;
        totalPassed++;
      }
    }

    // Print per-implementation summary
    for (const [impl, stats] of Object.entries(byImplementation)) {
      const percentage = ((stats.passed / stats.total) * 100).toFixed(1);
      console.log(
        `${impl}: ${stats.passed}/${stats.total} tests passed (${percentage}%)`
      );
    }

    console.log(`\\nOverall: ${totalPassed}/${totalTests} tests passed\\n`);

    // Print failed tests
    const failed = this.results.filter((r) => !r.passed);
    if (failed.length > 0) {
      console.log('❌ Failed tests:');
      failed.forEach((test) => {
        console.log(
          `  ${test.implementation}: ${test.testName} - ${test.description}`
        );
      });
    }

    // Exit with appropriate code
    process.exit(totalPassed === totalTests ? 0 : 1);
  }
}

// Run tests
const configPath = path.join(__dirname, 'test-config.json');
const runner = new E2ETestRunner(configPath);

runner.runAllTests().catch((error) => {
  console.error('❌ E2E test runner failed:', error.message);
  process.exit(1);
});
