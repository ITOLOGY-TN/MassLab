import { describe, expect, it } from 'vitest';

import { slugify } from '../../services/nutrition/foodSlug.js';

describe('slugify', () => {
  it('lowercases the name', () => {
    expect(slugify('Poulet')).toBe('poulet');
    expect(slugify('CHICKEN')).toBe('chicken');
  });

  it('strips diacritics', () => {
    expect(slugify('Poêlée')).toBe('poelee');
    expect(slugify('Blé')).toBe('ble');
    expect(slugify('Crème brûlée')).toBe('creme-brulee');
    expect(slugify('Café')).toBe('cafe');
  });

  it('replaces any run of non-alphanumeric with a single hyphen', () => {
    expect(slugify('Poulet maison')).toBe('poulet-maison');
    expect(slugify('riz   blanc')).toBe('riz-blanc');
    expect(slugify('huile d’olive')).toBe('huile-d-olive');
    expect(slugify('lait 1/2 écrémé')).toBe('lait-1-2-ecreme');
    expect(slugify('pain & beurre')).toBe('pain-beurre');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  Poulet  ')).toBe('poulet');
    expect(slugify('---Poulet---')).toBe('poulet');
    expect(slugify('!Poulet!')).toBe('poulet');
  });

  it('is idempotent', () => {
    const once = slugify('Crème brûlée maison');
    expect(slugify(once)).toBe(once);
    expect(once).toBe('creme-brulee-maison');
  });

  it('reconciles differently-cased / accented spellings of the same name (FR-002a)', () => {
    expect(slugify('Poêlée')).toBe(slugify('poelee'));
    expect(slugify('Poulet Maison')).toBe(slugify('poulet maison'));
    expect(slugify('CRÈME Brûlée')).toBe(slugify('creme brulee'));
    expect(slugify('Blé')).toBe(slugify('BLE'));
  });

  it('preserves alphanumerics including digits', () => {
    expect(slugify('Omega 3')).toBe('omega-3');
    expect(slugify('Vitamine B12')).toBe('vitamine-b12');
  });
});
