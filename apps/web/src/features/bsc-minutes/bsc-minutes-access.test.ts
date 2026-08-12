import { describe, expect, it } from 'vitest';
import { canAccessWorkspacePath } from '../auth/landing';

describe('BSC minutes access', () => {
  it('allows the configured minutes permission and rejects ordinary BSC roles', () => {
    expect(canAccessWorkspacePath('/management/bsc-minutes', ['bsc.minutes.create'], [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: ['bsc.minutes.create'] }])).toBe(true);
    expect(canAccessWorkspacePath('/management/bsc-minutes', ['bsc.minutes.view'], [{ code: 'DIRECTOR', scopeType: 'GLOBAL', scopeId: null, permissions: ['bsc.minutes.view'] }])).toBe(true);
    expect(canAccessWorkspacePath('/management/bsc-minutes', ['bsc.minutes.view'], [{ code: 'MANAGER', scopeType: 'DEPARTMENT', scopeId: 'department-1', permissions: ['bsc.minutes.view'] }])).toBe(false);
    expect(canAccessWorkspacePath('/management/bsc-minutes', ['bsc.view.own'])).toBe(false);
    expect(canAccessWorkspacePath('/management/bsc-minutes', ['bsc.statistics.unit'])).toBe(false);
  });
});
