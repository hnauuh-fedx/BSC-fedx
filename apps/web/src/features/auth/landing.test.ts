import { describe, expect, it } from 'vitest';
import { resolveLandingPath } from './landing';

describe('resolveLandingPath', () => {
  it('prioritizes personal BSC, management dashboard, review, then administration by permission', () => {
    expect(resolveLandingPath(['bsc.view.own', 'bsc.statistics.unit'])).toBe('/employee-bsc');
    expect(resolveLandingPath(['bsc.statistics.organization'])).toBe('/dashboard');
    expect(resolveLandingPath(['bsc.plan.approve.subordinate'])).toBe('/employee-bsc/reviews');
    expect(resolveLandingPath(['department.manage'])).toBe('/management');
  });

  it('uses a safe no-access destination when no module permission exists', () => {
    expect(resolveLandingPath([])).toBe('/no-access');
  });
});
