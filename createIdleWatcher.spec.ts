import { expect, it } from 'vitest';
import { createIdleWatcher } from './createIdleWatcher';
import { sleepms } from './utils';

it('createIdleWatcher should trigger onIdle after timeout', async () => {
  let idleTriggered = false;
  const watcher = createIdleWatcher(() => {
    idleTriggered = true;
  }, 100);

  watcher.ping();
  await sleepms(150);
  expect(idleTriggered).toBe(true);
}, 1000);

it.concurrent(
  'createIdleWatcher should reset timeout on ping',
  async () => {
    let idleTriggered = false;
    const watcher = createIdleWatcher(() => {
      idleTriggered = true;
    }, 100);

    watcher.ping();
    await sleepms(50);
    watcher.ping();
    await sleepms(50);
    expect(idleTriggered).toBe(false);
    await sleepms(100);
    expect(idleTriggered).toBe(true);
  },
  1000,
);

it.concurrent(
  'createIdleWatcher should update lastActiveTime on ping',
  async () => {
    const watcher = createIdleWatcher(() => {}, 1000);

    const initialTime = watcher.getLastActiveTime();
    await sleepms(50);
    watcher.ping();
    const updatedTime = watcher.getLastActiveTime();

    expect(updatedTime.getTime()).toBeGreaterThan(initialTime.getTime());
  },
  1000,
);
