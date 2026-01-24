#!/usr/bin/env bun test
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawn } from "child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

/**
 * Integration test for FIFO --append-prompt functionality using mock-claude-cli.
 *
 * Tests the full flow:
 * 1. Start agent-yes with mock CLI and --fifo enabled
 * 2. Wait for agent to be ready (mock emits "? for shortcuts")
 * 3. Use --append-prompt to send a prompt via FIFO
 * 4. Verify mock CLI received the prompt
 * 5. Clean up
 */

const TEST_DIR = join(process.cwd(), "tmp-test-fifo");
const MOCK_CLI_PATH = join(process.cwd(), "ts/tests/mock-claude-cli.ts");
const AGENT_YES_CLI = join(process.cwd(), "ts/cli.ts");

describe("IPC append-prompt integration", () => {
  beforeEach(() => {
    // Create clean test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should send prompt via IPC to running agent", async () => {
    const receivedLogPath = join(TEST_DIR, ".agent-yes", "mock-received.log");

    // Create test config that overrides claude binary to use mock
    const configDir = join(TEST_DIR, ".agent-yes");
    mkdirSync(configDir, { recursive: true });
    const configContent = `export default {
  clis: {
    claude: {
      binary: "bun ${MOCK_CLI_PATH.replace(/\\/g, "/")}",
      ready: [/\\? for shortcuts/],
    },
  },
};`;
    require("fs").writeFileSync(join(configDir, "config.ts"), configContent);

    // Start agent-yes with mock claude CLI and --ipc
    const agentProc = spawn(
      "bun",
      [AGENT_YES_CLI, "--ipc", "claude", "--", "initial test prompt"],
      {
        cwd: TEST_DIR,
      },
    );

    let stdout = "";
    let stderr = "";
    agentProc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    agentProc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    // Wait for agent to be ready (FIFO hint should appear in stderr)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        agentProc.kill();
        reject(new Error("Timeout waiting for FIFO hint"));
      }, 10000);

      const checkReady = () => {
        if (stderr.includes("Append prompts:") && stderr.includes("--append-prompt")) {
          clearTimeout(timeout);
          resolve();
        }
      };

      agentProc.stderr?.on("data", checkReady);
    });

    console.log("Agent ready, FIFO hint detected");

    // Give it a moment to settle
    await new Promise((r) => setTimeout(r, 500));

    // Send prompt via --append-prompt
    const appendProc = spawn("bun", [AGENT_YES_CLI, "--append-prompt", "hello from FIFO"], {
      cwd: TEST_DIR,
    });

    const appendPromise = new Promise<void>((resolve, reject) => {
      let appendOut = "";
      appendProc.stdout?.on("data", (chunk) => {
        appendOut += chunk.toString();
      });
      appendProc.on("exit", (code) => {
        if (code === 0) {
          console.log("Append-prompt command succeeded:", appendOut.trim());
          resolve();
        } else {
          reject(new Error(`Append-prompt exited with code ${code}`));
        }
      });
      setTimeout(() => reject(new Error("Append-prompt timeout")), 5000);
    });

    await appendPromise;

    // Give mock CLI time to process and write log
    await new Promise((r) => setTimeout(r, 500));

    // Verify mock received the prompt
    expect(existsSync(receivedLogPath)).toBe(true);
    const logContent = readFileSync(receivedLogPath, "utf8");
    console.log("Mock received log:", logContent);

    expect(logContent).toContain("stdin: hello from FIFO");

    // Send exit command to clean up
    agentProc.stdin?.write("/exit\r");

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      agentProc.on("exit", () => {
        console.log("Agent process exited");
        resolve();
      });
      setTimeout(() => {
        agentProc.kill();
        resolve();
      }, 3000);
    });
  }, 20000); // 20s timeout for full test

  it("should fail gracefully when no active IPC agent exists", async () => {
    // Try to append prompt when no agent is running
    const appendProc = spawn("bun", [AGENT_YES_CLI, "--append-prompt", "test prompt"], {
      cwd: TEST_DIR,
    });

    const result = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
      let stderr = "";
      appendProc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      appendProc.on("exit", (code) => {
        resolve({ code, stderr });
      });
      setTimeout(() => {
        appendProc.kill();
        resolve({ code: null, stderr });
      }, 5000);
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No active agent with FIFO found");
  }, 10000);
});
