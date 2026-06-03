import { describe, it, expect } from 'vitest';
import { build } from '../../services/bodyTracking/photoGalleryView.js';

const url = (key) => `/static/${key}`;

describe('photoGalleryView.build', () => {
  it('maps rows to gallery items', () => {
    const rows = [
      {
        id: 'a1',
        taken_on: '2026-05-01',
        storage_key: 'photos/ath/a1.jpg',
        weight_overlay_kg: 60.5,
        note: 'front',
      },
    ];
    const { items } = build({ rows, url });
    expect(items).toEqual([
      {
        id: 'a1',
        takenOn: '2026-05-01',
        weightKg: 60.5,
        url: '/static/photos/ath/a1.jpg',
        note: 'front',
      },
    ]);
  });

  it('preserves the (date-desc) order of the input rows', () => {
    const rows = [
      { id: 'b', taken_on: '2026-05-10', storage_key: 'k/b.jpg', weight_overlay_kg: 61, note: null },
      { id: 'a', taken_on: '2026-05-01', storage_key: 'k/a.jpg', weight_overlay_kg: 60, note: null },
    ];
    const { items } = build({ rows, url });
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(items.map((i) => i.takenOn)).toEqual(['2026-05-10', '2026-05-01']);
  });

  it('defaults missing weight_overlay_kg and note to null', () => {
    const rows = [{ id: 'c', taken_on: '2026-05-02', storage_key: 'k/c.jpg' }];
    const { items } = build({ rows, url });
    expect(items[0].weightKg).toBeNull();
    expect(items[0].note).toBeNull();
    expect(items[0].url).toBe('/static/k/c.jpg');
  });

  it('handles a null/undefined weight as null (not 0)', () => {
    const rows = [
      { id: 'd', taken_on: '2026-05-03', storage_key: 'k/d.jpg', weight_overlay_kg: null, note: 'x' },
    ];
    const { items } = build({ rows, url });
    expect(items[0].weightKg).toBeNull();
  });

  it('handles empty rows', () => {
    expect(build({ rows: [], url })).toEqual({ items: [] });
  });

  it('handles missing rows arg', () => {
    expect(build({ url })).toEqual({ items: [] });
  });

  it('handles no args at all', () => {
    expect(build()).toEqual({ items: [] });
  });
});
