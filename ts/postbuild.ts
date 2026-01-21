#! /usr/bin/env bun
/**
 * Postbuild script: Create Node.js wrapper files in dist/
 * These wrappers execute dist/cli.js with the appropriate CLI name
 */
import { writeFile, chmod } from "fs/promises";
import { CLIS_CONFIG } from "./index.ts";
import sflow from "sflow";
import pkg from "../package.json";

// Create copies for each CLI variant (all use the same wrapper logic)
await sflow([...Object.keys(CLIS_CONFIG), 'agent'])
  .map(async (cli) => {
    const cliName = `${cli}-yes`;

    const wrapperPath = `./dist/${cliName}.js`;
    await writeFile(wrapperPath, `
#!/usr/bin/env bun
await import('../dist/cli.js')
`.trim());
    await chmod(wrapperPath, 0o755);

    if (!(pkg.bin as Record<string, string>)?.[cliName]) {
      await Bun.$`npm pkg set ${"bin." + cliName}=${wrapperPath}`;
      console.log(`${wrapperPath} created`);
    }
  })

  .run();
