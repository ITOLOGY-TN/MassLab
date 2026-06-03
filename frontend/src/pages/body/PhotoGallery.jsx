// Phase 6 (009-body-weight-measurements) T040 [US4] — /body/photos. The progress
// gallery: a date-ordered grid (the API returns date-desc) with each photo's date
// and weight overlay (FR-024), a full-screen lightbox (FR-025), a before/after
// side-by-side comparison selector (FR-026), and delete-with-confirm wired to
// deletePhoto which removes the row + stored file (FR-012). Designed empty state
// (FR-027). Weights are kg as the API returns them.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPhotos, deletePhoto } from '../../lib/bodyTrackingApi.js';
import { usePreferredUnit } from '../../lib/usePreferredUnit.js';
import { formatWeight } from '../../lib/units.js';

// Weight overlay is display-only (FR-028): the stored value stays kg, the eye
// sees the athlete's preferred unit.
function overlayLabel(item, unit) {
  return item.weightKg != null ? formatWeight(item.weightKg, unit) : '—';
}

export default function PhotoGallery() {
  const unit = usePreferredUnit();
  const [state, setState] = useState({ status: 'loading', data: null });
  // Lightbox: the id of the photo open full-screen, or null.
  const [lightboxId, setLightboxId] = useState(null);
  // Compare mode: collect up to two ids; when two are picked, show side-by-side.
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  // Monotonic request token: a slow earlier load() must never overwrite the
  // state from a newer one (out-of-order responses, e.g. reload after delete).
  const requestRef = useRef(0);

  function load() {
    const requestId = (requestRef.current += 1);
    const isLatest = () => requestRef.current === requestId;
    setState((s) => ({ status: s.data ? 'ready' : 'loading', data: s.data }));
    listPhotos()
      .then((data) => isLatest() && setState({ status: 'ready', data }))
      .catch(() => isLatest() && setState({ status: 'error', data: null }));
  }

  useEffect(() => {
    load();
  }, []);

  const items = state.data?.items ?? [];
  const byId = (id) => items.find((p) => p.id === id) ?? null;
  const lightboxItem = lightboxId != null ? byId(lightboxId) : null;
  const comparePair = selected.length === 2 ? selected.map(byId).filter(Boolean) : [];

  function toggleSelect(id) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      // Keep at most two; drop the oldest when a third is picked.
      return cur.length < 2 ? [...cur, id] : [cur[1], id];
    });
  }

  function onTileClick(item) {
    if (compareMode) toggleSelect(item.id);
    else setLightboxId(item.id);
  }

  async function onDelete(item) {
    // Explicit confirm before a destructive, irreversible delete (FR-012).
    if (!window.confirm(`Supprimer la photo du ${item.takenOn} ?`)) return;
    setDeletingId(item.id);
    try {
      await deletePhoto(item.id);
      setSelected((cur) => cur.filter((x) => x !== item.id));
      if (lightboxId === item.id) setLightboxId(null);
      load();
    } catch {
      // Surface a non-silent failure; the list reloads on the next action.
      window.alert('Échec de la suppression.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-lg py-xl">
      <header className="mb-lg flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Photos</h1>
          <p className="mt-xs text-muted">Ta transformation, jour après jour.</p>
        </div>
        <Link to="/body" className="text-sm text-accent hover:underline">
          ← Corps
        </Link>
      </header>

      {state.status === 'loading' && <p className="text-sm text-muted">Chargement…</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          Impossible de charger les photos.
        </p>
      )}

      {state.status === 'ready' && items.length === 0 && (
        <div
          data-testid="gallery-empty"
          className="flex flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-muted/40 px-lg py-xl text-center"
        >
          <p className="text-base font-semibold text-text">Aucune photo pour l’instant</p>
          <p className="text-sm text-muted">
            Ajoute une photo depuis l’écran Corps pour démarrer ta galerie avant/après.
          </p>
        </div>
      )}

      {state.status === 'ready' && items.length > 0 && (
        <>
          <div className="mb-md flex items-center gap-md">
            <button
              type="button"
              onClick={() => {
                setCompareMode((v) => !v);
                setSelected([]);
              }}
              className={`rounded-md px-md py-sm text-sm font-medium ${
                compareMode ? 'bg-accent text-bg' : 'border border-accent text-accent'
              }`}
            >
              {compareMode ? 'Quitter la comparaison' : 'Comparer avant / après'}
            </button>
            {compareMode && (
              <span className="text-sm text-muted">
                Sélectionne deux photos ({selected.length}/2).
              </span>
            )}
          </div>

          <ul
            data-testid="photo-grid"
            className="grid grid-cols-2 gap-md sm:grid-cols-3 md:grid-cols-4"
          >
            {items.map((item) => {
              const isSelected = selected.includes(item.id);
              return (
                <li key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onTileClick(item)}
                    aria-label={`Photo du ${item.takenOn}`}
                    className={`block w-full overflow-hidden rounded-lg border ${
                      isSelected ? 'border-accent ring-2 ring-accent' : 'border-muted/20'
                    }`}
                  >
                    <img
                      src={item.url}
                      alt={`Progression du ${item.takenOn}`}
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-sm py-xs text-xs text-white">
                      <span>{item.takenOn}</span>
                      <span className="font-semibold" data-testid="photo-weight-overlay">
                        {overlayLabel(item, unit)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    disabled={deletingId === item.id}
                    aria-label={`Supprimer la photo du ${item.takenOn}`}
                    className="absolute right-xs top-xs rounded-full bg-black/55 px-sm py-px text-xs text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Before/after side-by-side comparison (FR-026). */}
      {comparePair.length === 2 && (
        <div
          data-testid="compare-view"
          className="fixed inset-0 z-40 flex flex-col bg-black/90 p-lg"
          role="dialog"
          aria-label="Comparaison avant / après"
        >
          <button
            type="button"
            onClick={() => setSelected([])}
            className="mb-md self-end rounded-md border border-white/40 px-md py-sm text-sm text-white"
          >
            Fermer
          </button>
          <div className="flex flex-1 items-center justify-center gap-md">
            {comparePair.map((item, i) => (
              <figure key={item.id} className="flex max-h-full flex-1 flex-col items-center">
                <figcaption className="mb-xs text-sm text-white/80">
                  {i === 0 ? 'Avant' : 'Après'} — {item.takenOn} · {overlayLabel(item, unit)}
                </figcaption>
                <img
                  src={item.url}
                  alt={`Progression du ${item.takenOn}`}
                  className="max-h-[75vh] w-auto rounded-lg object-contain"
                />
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* Full-screen lightbox (FR-025). */}
      {lightboxItem && (
        <div
          data-testid="lightbox"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-lg"
          role="dialog"
          aria-label={`Photo du ${lightboxItem.takenOn}`}
          onClick={() => setLightboxId(null)}
        >
          <img
            src={lightboxItem.url}
            alt={`Progression du ${lightboxItem.takenOn}`}
            className="max-h-[85vh] w-auto rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-md text-sm text-white/80">
            {lightboxItem.takenOn} · {overlayLabel(lightboxItem, unit)}
          </p>
          <button
            type="button"
            onClick={() => setLightboxId(null)}
            className="absolute right-lg top-lg rounded-md border border-white/40 px-md py-sm text-sm text-white"
          >
            Fermer
          </button>
        </div>
      )}
    </main>
  );
}
