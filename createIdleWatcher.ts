
export function createIdleWatcher(onIdle: () => void, idleTimeout: number): { ping: () => void; getLastActiveTime: () => Date; } {
    let lastActiveTime = new Date();
    let idleTimeoutId: NodeJS.Timeout | null = null;
    return {
        ping: () => {
            if (idleTimeoutId) {
                clearTimeout(idleTimeoutId);
            }
            idleTimeoutId = setTimeout(() => {
                clearTimeout(idleTimeoutId!);
                onIdle();
            }, idleTimeout);
            lastActiveTime = new Date();
        },
        getLastActiveTime: () => lastActiveTime
    };
}
