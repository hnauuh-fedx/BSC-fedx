import { describe, expect, it } from 'vitest';
import { canAccessWorkspacePath, resolveLandingPath } from '../auth/landing';

describe('department BSC routing', () => {
  it('routes department managers and reviewers to the dedicated workspace', () => {
    expect(resolveLandingPath(['bsc.department.view'])).toBe('/department-bsc');
    expect(canAccessWorkspacePath('/department-bsc/new', ['bsc.department.create'])).toBe(true);
    expect(canAccessWorkspacePath('/department-bsc/bsc-1', ['bsc.department.view'])).toBe(true);
    expect(canAccessWorkspacePath('/management/department-bsc-reviews', ['bsc.department.plan.approve'])).toBe(true);
    expect(canAccessWorkspacePath('/management/department-bsc-reviews', ['bsc.department.view'])).toBe(false);
  });
});
