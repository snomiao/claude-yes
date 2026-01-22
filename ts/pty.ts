import { logger } from "./logger.ts";

// its recommened to use bun-pty in windows, since node-pty is super complex to install there, requires a 10G M$ build tools

async function getPty() {
  return globalThis.Bun
    ? await import("bun-pty").catch((error) => {
        logger.error("Failed to load bun-pty:", error);
        throw error;
      })
    : await import("node-pty").catch((error) => {
        logger.error("Failed to load node-pty:", error);
        throw error;
      });
}

const pty = await getPty();
export const ptyPackage = globalThis.Bun ? "bun-pty" : "node-pty";
export default pty;
