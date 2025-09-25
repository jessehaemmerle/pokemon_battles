import { TYPE_CHART } from '../shared/typeChart.js';
import { describe, it, expect } from 'vitest';

describe('TYPE_CHART', () => {
  it('fire super effective vs grass', () => {
    expect(TYPE_CHART.fire.grass).toBe(2);
  });
  it('electric no effect vs ground', () => {
    expect(TYPE_CHART.electric.ground).toBe(0);
  });
});
