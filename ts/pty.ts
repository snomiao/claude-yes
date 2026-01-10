// if node-pty is not installed, re-run with bun
// const hasNodePty = !!(await import("node-pty").catch(() => null));
// if (!globalThis.Bun && !hasNodePty) {
//   // run with same arguments in Bun if not already
//   console.log("Info: No node-pty installed. Re-running with Bun...", process.argv);
//   (await import("child_process")).spawnSync(
//     "node_modules/.bin/bun",
//     [process.argv[1]!, "--", ...process.argv.slice(2)],
//     { stdio: "inherit" },
//   );
//   process.exit(0);
// }
// check and fix bun-pty on some systems
//   await import("./pty-fix.js")
// console.log('Running', process.argv);

import { logger } from "./logger.ts";

// its recommened to use bun-pty in windows, since node-pty is super complex to install there, requires a 10G M$ build tools
export const pty = await (async () => {
  if (globalThis.Bun) {
    logger.debug("Bun detected, using bun-pty");
    return await import("bun-pty");
  }
  return await import("node-pty");
})().catch(async (error) => {
  // DIE('Please install node-pty or bun-pty, run this: bun install bun-pty')
  logger.error(error);
  throw new Error("Please install node-pty or bun-pty, run this: bun install bun-pty", {
    cause: error,
  });
});

// if (globalThis.Bun) {
//   const entryPath = (fileURLToPath(import.meta.resolve('@snomiao/bun-pty'))); // path to bun-pty/dist/index.js
//   const pkgPath = path.resolve(entryPath, '..', '..'); // path to bun-pty package root
//   process.env.BUN_PTY_LIB = path.join(pkgPath, 'rust-pty', 'target', 'release', 'rust_pty.dll');
// }

export const ptyPackage = globalThis.Bun ? "bun-pty" : "node-pty";
export default pty;
