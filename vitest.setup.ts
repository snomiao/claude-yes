// Setup file to provide jest-compatible globals in vitest
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from 'vitest';

// Make jest globals available
(globalThis as any).jest = {
  mock: vi.mock,
  fn: vi.fn,
  spyOn: vi.spyOn,
  clearAllMocks: vi.clearAllMocks,
  resetAllMocks: vi.resetAllMocks,
  restoreAllMocks: vi.restoreAllMocks,
};

// Also make it available on global
(global as any).jest = (globalThis as any).jest;
