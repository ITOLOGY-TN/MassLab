import { describe, it, expect } from 'vitest';
import { bodySegmentFor } from '../../services/engine/bodySegment.js';

describe('bodySegmentFor', () => {
  it('classifies leg/lower slugs as lower', () => {
    expect(bodySegmentFor({ slug: 'legs-squat' })).toBe('lower');
    expect(bodySegmentFor({ slug: 'lower-back-extension' })).toBe('lower');
  });

  it('classifies upper-body slugs as upper', () => {
    expect(bodySegmentFor({ slug: 'bench-press' })).toBe('upper');
    expect(bodySegmentFor({ slug: 'overhead-press', targeted_muscles: ['shoulders'] })).toBe(
      'upper',
    );
  });

  it('uses muscle_group when provided', () => {
    expect(bodySegmentFor({ slug: 'hack', muscle_group: 'Legs Quads' })).toBe('lower');
  });

  it('defaults to upper for empty input', () => {
    expect(bodySegmentFor({})).toBe('upper');
    expect(bodySegmentFor()).toBe('upper');
  });
});
