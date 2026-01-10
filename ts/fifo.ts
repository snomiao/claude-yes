import { execaCommand, execaCommandSync } from "execa";
import { fromReadable } from "from-node-stream";
import { createReadStream, mkdirSync } from "fs";
import { unlink } from "fs/promises";
import { dirname } from "path";
import sflow from "sflow";
import { logger } from "./logger.ts";

/**
 * Creates a FIFO (named pipe) stream on Linux for additional stdin input
 * @param cli - The CLI name for logging purposes
 * @returns An object with stream and cleanup function, or null if failed
 */
export function createFifoStream(
  cli: string,
): { stream: ReadableStream<string>; cleanup: () => Promise<void> } | null {
  // Only create FIFO on Linux
  if (process.platform !== "linux") {
    return null;
  }

  let fifoPath: string | null = null;
  let fifoStream: ReturnType<typeof createReadStream> | null = null;

  try {
    const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
    const randomSuffix = Math.random().toString(36).substring(2, 5);

    fifoPath = `/tmp/agent-yes-${timestamp}${randomSuffix}.stdin`;
    mkdirSync(dirname(fifoPath), { recursive: true });

    // Create the named pipe using mkfifo
    const mkfifoResult = execaCommandSync(`mkfifo ${fifoPath}`, {
      reject: false,
    });

    if (mkfifoResult.exitCode !== 0) {
      logger.warn(`[${cli}-yes] mkfifo command failed with exit code ${mkfifoResult.exitCode}`);
      if (mkfifoResult.stderr) {
        logger.warn(`[${cli}-yes] mkfifo stderr: ${mkfifoResult.stderr}`);
      }
      if (mkfifoResult.stdout) {
        logger.warn(`[${cli}-yes] mkfifo stdout: ${mkfifoResult.stdout}`);
      }
      return null;
    }

    logger.info(`[${cli}-yes] Created FIFO at ${fifoPath}`);

    // Open the FIFO for reading
    // Note: This will block until a writer opens the FIFO, so we use a dummy writer to unblock it
    try {
      // Open a dummy writer in background to prevent blocking
      execaCommand(`exec 3>"${fifoPath}"`).catch(() => null);

      fifoStream = createReadStream(fifoPath, {
        flags: "r",
        autoClose: true,
      });

      logger.info(`[${cli}-yes] FIFO opened for reading`);

      // Cleanup FIFO function
      const cleanupFifo = async () => {
        if (fifoStream) {
          try {
            fifoStream.close();
            logger.debug(`[${cli}-yes] Closed FIFO stream`);
          } catch (error) {
            logger.debug(`[${cli}-yes] Error closing FIFO stream:`, { error });
          }
        }
        if (fifoPath) {
          try {
            await unlink(fifoPath).catch(() => null);
            logger.info(`[${cli}-yes] Cleaned up FIFO at ${fifoPath}`);
          } catch {}
        }
      };

      process.on("exit", () => {
        if (fifoPath) unlink(fifoPath).catch(() => null);
      });
      process.on("SIGINT", async () => {
        await cleanupFifo();
      });
      process.on("SIGTERM", async () => {
        await cleanupFifo();
      });

      return {
        stream: sflow(fromReadable(fifoStream)).map((buffer) => buffer.toString()),
        cleanup: cleanupFifo,
      };
    } catch (error) {
      logger.warn(`[${cli}-yes] Failed to open FIFO at ${fifoPath}:`, {
        error,
      });
      if (error instanceof Error) {
        logger.warn(`[${cli}-yes] Error details: ${error.message}`);
        if (error.stack) {
          logger.debug(`[${cli}-yes] Stack trace: ${error.stack}`);
        }
      }
      // Clean up the FIFO if we failed to open it
      if (fifoPath) {
        unlink(fifoPath).catch(() => null);
      }
      return null;
    }
  } catch (error) {
    logger.warn(`[${cli}-yes] Failed to create FIFO:`, { error });
    if (error instanceof Error) {
      logger.warn(`[${cli}-yes] Error details: ${error.message}`);
    }
    if (fifoPath) {
      unlink(fifoPath).catch(() => null);
    }
    return null;
  }
}
