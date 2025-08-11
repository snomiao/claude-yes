export function createIdleWatcher(
  onIdle: () => void,
  idleTimeout: number
): { ping: () => void; getLastActiveTime: () => Date } {
  let lastActiveTime = new Date();
  let idleTimeoutId: NodeJS.Timeout | null = null;

  return {
    ping: () => {
      if (idleTimeoutId) clearTimeout(idleTimeoutId);

      lastActiveTime = new Date();
      idleTimeoutId = setTimeout(() => {
        clearTimeout(idleTimeoutId!);
        onIdle();
      }, idleTimeout);
    },
    getLastActiveTime: () => lastActiveTime,
  };
}
