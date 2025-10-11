import { appendFile } from 'node:fs/promises';
import tsaComposer from 'tsa-composer';

// for debug
export const yesLog = tsaComposer()(async function yesLog(msg: string) {
  // await rm('agent-yes.log').catch(() => null); // ignore error if file doesn't exist
  await appendFile('agent-yes.log', `${msg}\n`).catch(() => null);
});
