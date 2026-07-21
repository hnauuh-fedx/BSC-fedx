import { describe, expect, it } from 'vitest';
import { resolveLandingPath } from './landing';

describe('resolveLandingPath', () => {
  it('prioritizes personal BSC, management dashboard, review, then administration by permission', () => {
    expect(resolveLandingPath(['bsc.view.own', 'bsc.statistics.unit'])).toBe('/employee-bsc');
    expect(resolveLandingPath(['bsc.statistics.organization'])).toBe('/management/bsc-overview');
    expect(resolveLandingPath(['bsc.plan.approve.subordinate'])).toBe('/management/bsc-overview');
    expect(resolveLandingPath(['department.manage'])).toBe('/management');
  });

  it('uses a safe no-access destination when no module permission exists', () => {
    expect(resolveLandingPath([])).toBe('/forbidden');
  });
});
