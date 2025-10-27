import { mkdir, readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

const SESSIONS_FILE = path.join(
  homedir(),
  '.config',
  'cli-yes',
  'codex-sessions.json',
);

export interface CodexSessionMap {
  [cwd: string]: {
    sessionId: string;
    lastUsed: string; // ISO timestamp
  };
}

/**
 * Load the session map from the config file
 */
export async function loadSessionMap(): Promise<CodexSessionMap> {
  try {
    const content = await readFile(SESSIONS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // File doesn't exist or is invalid, return empty map
    return {};
  }
}

/**
 * Save the session map to the config file
 */
export async function saveSessionMap(
  sessionMap: CodexSessionMap,
): Promise<void> {
  try {
    // Ensure the directory exists
    await mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
    await writeFile(SESSIONS_FILE, JSON.stringify(sessionMap, null, 2));
  } catch (error) {
    console.warn('Failed to save codex session map:', error);
  }
}

/**
 * Store a session ID for a specific working directory
 */
export async function storeSessionForCwd(
  cwd: string,
  sessionId: string,
): Promise<void> {
  const sessionMap = await loadSessionMap();
  sessionMap[cwd] = {
    sessionId,
    lastUsed: new Date().toISOString(),
  };
  await saveSessionMap(sessionMap);
}

/**
 * Get the last session ID for a specific working directory
 */
export async function getSessionForCwd(cwd: string): Promise<string | null> {
  const sessionMap = await loadSessionMap();
  return sessionMap[cwd]?.sessionId || null;
}

/**
 * Extract session ID from codex output
 * Session IDs are UUIDs in the format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export function extractSessionId(output: string): string | null {
  // Look for session ID in various contexts where it might appear
  const sessionIdRegex =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const match = output.match(sessionIdRegex);
  return match ? match[0] : null;
}

/**
 * Extract session ID from codex session file content
 * More reliable method that parses the session metadata
 */
export function extractSessionIdFromSessionMeta(
  sessionContent: string,
): string | null {
  try {
    // Parse the first line which should contain session metadata
    const firstLine = sessionContent.split('\n')[0];
    const sessionMeta = JSON.parse(firstLine);

    if (sessionMeta.type === 'session_meta' && sessionMeta.payload?.id) {
      return sessionMeta.payload.id;
    }
  } catch (error) {
    // If parsing fails, fall back to regex extraction
  }

  return extractSessionId(sessionContent);
}

/**
 * Clean up old sessions (keep only the most recent 10 per directory)
 */
export async function cleanupOldSessions(): Promise<void> {
  const sessionMap = await loadSessionMap();

  // Group sessions by directory and keep only the most recent ones
  const cleaned: CodexSessionMap = {};

  // Sort all sessions by lastUsed date (most recent first)
  const sortedEntries = Object.entries(sessionMap).sort(
    ([, a], [, b]) =>
      new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime(),
  );

  // Keep track of how many sessions we've kept per directory
  const dirCounts: { [dir: string]: number } = {};

  for (const [cwd, session] of sortedEntries) {
    const count = dirCounts[cwd] || 0;
    if (count < 5) {
      // Keep up to 5 sessions per directory
      cleaned[cwd] = session;
      dirCounts[cwd] = count + 1;
    }
  }

  await saveSessionMap(cleaned);
}
