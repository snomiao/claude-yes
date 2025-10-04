#!/usr/bin/env node

import { spawn } from 'child_process';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ViteDevServerTest {
  constructor(implementation = 'rust') {
    this.implementation = implementation;
    this.vitePath = path.join(__dirname, 'vite-project');
    this.claudeYesBinary =
      implementation === 'rust'
        ? path.join(__dirname, '../target/release/claude-yes')
        : 'npx claude-yes';
  }

  async testViteDevServerStart() {
    console.log(
      `🧪 Testing Vite dev server start with ${this.implementation} implementation...`
    );

    return new Promise((resolve, reject) => {
      // Start claude-yes with vite dev command
      const command =
        this.implementation === 'rust' ? this.claudeYesBinary : 'npx';

      const args =
        this.implementation === 'rust'
          ? [
              '--exit-on-idle',
              '30s',
              '--',
              'cd',
              this.vitePath,
              '&&',
              'npm',
              'run',
              'dev',
            ]
          : [
              'claude-yes',
              '--exit-on-idle',
              '30s',
              '--',
              'cd',
              this.vitePath,
              '&&',
              'npm',
              'run',
              'dev',
            ];

      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      let output = '';
      let serverStarted = false;
      let testPassed = false;

      child.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('📤', text.trim());

        // Check if Vite dev server started
        if (text.includes('Local:') && text.includes('localhost:3000')) {
          serverStarted = true;
          console.log('✅ Vite dev server started successfully');

          // Test server accessibility
          this.testServerAccessibility()
            .then(() => {
              testPassed = true;
              console.log('✅ Server is accessible');
              child.kill('SIGTERM');
            })
            .catch((error) => {
              console.error(
                '❌ Server accessibility test failed:',
                error.message
              );
              child.kill('SIGTERM');
            });
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('📥', text.trim());
      });

      child.on('close', (code) => {
        console.log(`\\n📊 Test Results:`);
        console.log(`Implementation: ${this.implementation}`);
        console.log(`Server Started: ${serverStarted ? '✅' : '❌'}`);
        console.log(`Server Accessible: ${testPassed ? '✅' : '❌'}`);
        console.log(`Exit Code: ${code}`);

        if (testPassed) {
          resolve({
            success: true,
            serverStarted,
            accessible: testPassed,
            output,
          });
        } else {
          reject(
            new Error(
              `Test failed - Server started: ${serverStarted}, Accessible: ${testPassed}`
            )
          );
        }
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        console.log('⏰ Test timeout');
        child.kill('SIGTERM');
        reject(new Error('Test timeout'));
      }, 60000);
    });
  }

  async testServerAccessibility() {
    // Wait a bit for server to fully start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const response = await fetch('http://localhost:3000');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      if (!html.includes('Claude-Yes E2E Test')) {
        throw new Error('Expected content not found in response');
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to access server: ${error.message}`);
    }
  }
}

// Run test
const implementation = process.argv[2] || 'rust';
const test = new ViteDevServerTest(implementation);

test
  .testViteDevServerStart()
  .then((result) => {
    console.log('\\n🎉 E2E test passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\\n❌ E2E test failed:', error.message);
    process.exit(1);
  });
