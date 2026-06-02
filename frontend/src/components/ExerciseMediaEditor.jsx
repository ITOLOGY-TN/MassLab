// US4 — attach/clear an exercise's image and video (YouTube link or upload).
import { useRef, useState } from 'react';
import {
  uploadExerciseImage,
  clearExerciseImage,
  setExerciseVideoUrl,
  uploadExerciseVideo,
  clearExerciseVideo,
} from '../lib/programApi.js';

export default function ExerciseMediaEditor({ exerciseId, onChange }) {
  const imageInput = useRef(null);
  const videoInput = useRef(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange?.();
    } catch (err) {
      setError(err?.message ?? 'Échec de l’opération.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="media-editor"
      className="flex flex-col gap-md rounded-lg border border-muted/20 p-md"
    >
      <div className="flex flex-wrap items-center gap-sm">
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          data-testid="image-input"
          className="text-sm"
          onChange={(e) =>
            e.target.files?.[0] && run(() => uploadExerciseImage(exerciseId, e.target.files[0]))
          }
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => clearExerciseImage(exerciseId))}
          className="rounded-md border border-muted/30 px-sm py-xs text-xs text-muted hover:text-text"
        >
          Retirer l’image
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <input
          type="url"
          value={videoUrl}
          placeholder="Lien YouTube"
          data-testid="video-url-input"
          onChange={(e) => setVideoUrl(e.target.value)}
          className="flex-1 rounded-md border border-muted/30 bg-bg px-sm py-xs text-sm"
        />
        <button
          type="button"
          disabled={busy || !videoUrl}
          onClick={() =>
            run(async () => {
              await setExerciseVideoUrl(exerciseId, videoUrl);
              setVideoUrl('');
            })
          }
          className="rounded-md bg-accent px-sm py-xs text-xs font-medium text-bg disabled:opacity-50"
        >
          Définir
        </button>
        <input
          ref={videoInput}
          type="file"
          accept="video/*"
          data-testid="video-input"
          className="text-sm"
          onChange={(e) =>
            e.target.files?.[0] && run(() => uploadExerciseVideo(exerciseId, e.target.files[0]))
          }
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => clearExerciseVideo(exerciseId))}
          className="rounded-md border border-muted/30 px-sm py-xs text-xs text-muted hover:text-text"
        >
          Retirer la vidéo
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
