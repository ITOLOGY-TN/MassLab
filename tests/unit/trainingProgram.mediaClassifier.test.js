import { describe, it, expect } from 'vitest';
import { normalizeYoutubeUrl, classifyVideo } from '../../services/trainingProgram/mediaClassifier.js';

const HOST = 'https://www.youtube-nocookie.com';

describe('mediaClassifier.normalizeYoutubeUrl (D-8, D1)', () => {
  it.each([
    ['https://www.youtube.com/watch?v=rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['https://youtu.be/rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['https://www.youtube.com/embed/rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['https://www.youtube.com/shorts/rT7DgCr-3pg', 'rT7DgCr-3pg'],
    ['https://www.youtube.com/watch?v=rT7DgCr-3pg&t=30s', 'rT7DgCr-3pg'],
  ])('normalizes %s', (input, id) => {
    expect(normalizeYoutubeUrl(input, HOST)).toBe(`${HOST}/embed/${id}`);
  });

  it('returns null for non-YouTube input', () => {
    expect(normalizeYoutubeUrl('https://example.com/video.mp4', HOST)).toBeNull();
    expect(normalizeYoutubeUrl('', HOST)).toBeNull();
    expect(normalizeYoutubeUrl(null, HOST)).toBeNull();
  });
});

describe('mediaClassifier.classifyVideo', () => {
  it('classifies null/empty as no video', () => {
    expect(classifyVideo(null, HOST)).toEqual({ kind: null, url: null });
    expect(classifyVideo('', HOST)).toEqual({ kind: null, url: null });
  });

  it('classifies a YouTube link as an embed', () => {
    expect(classifyVideo('https://youtu.be/rT7DgCr-3pg', HOST)).toEqual({
      kind: 'youtube',
      url: `${HOST}/embed/rT7DgCr-3pg`,
    });
  });

  it('classifies a stored key/url as an upload, untouched', () => {
    expect(classifyVideo('/media/abc123.mp4', HOST)).toEqual({
      kind: 'upload',
      url: '/media/abc123.mp4',
    });
  });
});
