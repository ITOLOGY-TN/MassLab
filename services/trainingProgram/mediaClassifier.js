// Pure — classify an exercise's stored video reference and normalize YouTube
// links to a privacy-enhanced embed URL. SINGLE SOURCE OF TRUTH for YouTube
// normalization: both the read path (exerciseView) and the write path
// (exercises media endpoint) call normalizeYoutubeUrl. research D-8; remediation D1.

const DEFAULT_EMBED_HOST = 'https://www.youtube-nocookie.com';

// Extract the 11-char video id from watch / share / embed / shorts forms.
function youtubeId(url) {
  if (typeof url !== 'string') return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/, // watch?v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/, // youtu.be/ID
    /\/embed\/([a-zA-Z0-9_-]{11})/, // /embed/ID
    /\/shorts\/([a-zA-Z0-9_-]{11})/, // /shorts/ID
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * @returns the canonical embed URL for a YouTube link, or null when the input
 * is not a recognizable YouTube URL.
 */
export function normalizeYoutubeUrl(url, embedHost = DEFAULT_EMBED_HOST) {
  const id = youtubeId(url);
  if (!id) return null;
  return `${String(embedHost).replace(/\/$/, '')}/embed/${id}`;
}

/**
 * Classify a stored `media_video_url`:
 *  - null/empty           → { kind: null, url: null }
 *  - a YouTube URL        → { kind: 'youtube', url: <embed url> }
 *  - anything else (a key/url from photoStorage) → { kind: 'upload', url }
 */
export function classifyVideo(mediaVideoUrl, embedHost = DEFAULT_EMBED_HOST) {
  if (!mediaVideoUrl) return { kind: null, url: null };
  const embed = normalizeYoutubeUrl(mediaVideoUrl, embedHost);
  if (embed) return { kind: 'youtube', url: embed };
  return { kind: 'upload', url: mediaVideoUrl };
}
