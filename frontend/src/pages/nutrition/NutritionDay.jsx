// Phase 7 (010-phase7-nutrition-calories) T024 — /nutrition. The daily food log:
// a header with four progress bars (calories / protein / carbs / fat) that turn
// distinctly when over target, and five French-labelled meal-slot cards. Each
// card lists its entries (food name, grams, kcal) with a per-entry remove and an
// inline quantity edit, a per-meal subtotal, and an "add food" control: a
// debounced food search whose results can be logged with a quantity, falling back
// to an inline custom-food form when the search comes up empty. Every mutation
// refetches GET /nutrition/day so the bars and subtotals stay live.
//
// Nutrition values stay metric (kcal / g) — no kg/lbs conversion here (D-4).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDay,
  logEntry,
  editEntry,
  deleteEntry,
  searchFoods,
  loadPlan,
  addHydration,
} from '../../lib/nutritionApi.js';
import StateBlock from '../../components/StateBlock.jsx';
import HydrationGauge from '../../components/charts/HydrationGauge.jsx';

// The five meal slots in eating order, with their French labels (FR-006).
const SLOTS = [
  { key: 'breakfast', label: 'Petit-déjeuner' },
  { key: 'lunch', label: 'Déjeuner' },
  { key: 'pre_workout', label: 'Collation pré-entraînement' },
  { key: 'dinner', label: 'Dîner' },
  { key: 'evening_snack', label: 'Collation du soir' },
];

const SEARCH_DEBOUNCE_MS = 300;

// Round for display without trailing noise (snapshots are numeric(7,2)).
function round(value) {
  if (value == null) return 0;
  return Math.round(Number(value) * 10) / 10;
}

// ---- Progress bars (FR-007) -------------------------------------------------
// Four macro bars in the sticky header. `state` ∈ {under, at, over} comes from
// the view model; `over` gets a distinct danger tone so it reads at a glance.
const BAR_META = {
  kcal: { label: 'Calories', unit: 'kcal', tone: 'rgb(var(--color-accent))' },
  protein_g: { label: 'Protéines', unit: 'g', tone: 'rgb(var(--color-success))' },
  carbs_g: { label: 'Glucides', unit: 'g', tone: 'rgb(var(--color-warn))' },
  fat_g: { label: 'Lipides', unit: 'g', tone: 'rgb(var(--color-accent))' },
};

function ProgressBar({ macroKey, bar }) {
  const meta = BAR_META[macroKey];
  const value = round(bar?.value);
  const target = bar?.target != null ? round(bar.target) : null;
  const over = bar?.state === 'over';
  // pct from the model is 0..1+; clamp the fill to 100% but keep the over tone.
  const fillPct = Math.min(1, Math.max(0, bar?.pct ?? 0)) * 100;

  return (
    <div data-testid={`bar-${macroKey}`} data-state={bar?.state ?? 'under'}>
      <div className="mb-xs flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted">{meta.label}</span>
        <span className={over ? 'font-semibold text-danger' : 'text-text'}>
          {value}
          {target != null ? ` / ${target}` : ''} {meta.unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/15">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${fillPct}%`,
            backgroundColor: over ? 'rgb(var(--color-danger))' : meta.tone,
          }}
        />
      </div>
    </div>
  );
}

function DayBars({ bars }) {
  return (
    <div className="grid grid-cols-2 gap-md rounded-lg border border-surface bg-surface/40 p-lg shadow-sm sm:grid-cols-4">
      {['kcal', 'protein_g', 'carbs_g', 'fat_g'].map((key) => (
        <ProgressBar key={key} macroKey={key} bar={bars?.[key]} />
      ))}
    </div>
  );
}

// ---- One logged entry (FR-005) ----------------------------------------------
// Shows food name / grams / kcal with an inline grams edit (commits on blur or
// Enter) and a remove button. Both actions trigger a day refetch via onChange.
function EntryRow({ entry, onChange, onError }) {
  const [grams, setGrams] = useState(String(round(entry.quantity_g)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setGrams(String(round(entry.quantity_g)));
  }, [entry.quantity_g]);

  async function commitGrams() {
    const q = Number(grams);
    if (!Number.isFinite(q) || q <= 0) {
      setGrams(String(round(entry.quantity_g)));
      return;
    }
    if (q === round(entry.quantity_g)) return;
    setBusy(true);
    try {
      await editEntry(entry.id, q);
      await onChange();
    } catch (err) {
      onError(err?.message ?? 'Échec de la mise à jour.');
      setGrams(String(round(entry.quantity_g)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteEntry(entry.id);
      await onChange();
    } catch (err) {
      onError(err?.message ?? 'Échec de la suppression.');
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="entry-row"
      className="flex items-center gap-md border-t border-muted/10 py-sm first:border-t-0"
    >
      <span className="flex-1 truncate text-sm text-text">{entry.food_name}</span>
      <div className="flex items-center gap-xs">
        <input
          type="number"
          inputMode="decimal"
          step="1"
          min="1"
          aria-label={`Quantité de ${entry.food_name} en grammes`}
          value={grams}
          disabled={busy}
          onChange={(e) => setGrams(e.target.value)}
          onBlur={commitGrams}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="w-16 rounded-md border border-muted/30 bg-bg px-sm py-xs text-right text-sm text-text focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-muted">g</span>
      </div>
      <span className="w-16 text-right text-sm font-medium text-text">
        {round(entry.kcal)} kcal
      </span>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={`Retirer ${entry.food_name}`}
        className="rounded-md px-sm py-xs text-lg leading-none text-muted hover:text-danger disabled:opacity-50"
      >
        ×
      </button>
    </div>
  );
}

// ---- Custom-food form (FR-002a) ---------------------------------------------
// Shown inline when a search returns nothing: name + four per-100g macros. On
// submit it logs through the custom_food path (the backend creates/reconciles
// the food, then logs it) using the slot's chosen grams.
const CUSTOM_FIELDS = [
  { key: 'kcal_per_100g', label: 'kcal / 100 g' },
  { key: 'protein_per_100g', label: 'Protéines / 100 g' },
  { key: 'carbs_per_100g', label: 'Glucides / 100 g' },
  { key: 'fat_per_100g', label: 'Lipides / 100 g' },
];

function CustomFoodForm({ initialName, grams, onSubmit, busy }) {
  const [name, setName] = useState(initialName ?? '');
  const [macros, setMacros] = useState({
    kcal_per_100g: '',
    protein_per_100g: '',
    carbs_per_100g: '',
    fat_per_100g: '',
  });
  const [localError, setLocalError] = useState(null);

  function submit(e) {
    e.preventDefault();
    setLocalError(null);
    if (!name.trim()) {
      setLocalError('Donne un nom à l’aliment.');
      return;
    }
    const payload = { name: name.trim() };
    for (const f of CUSTOM_FIELDS) {
      const v = Number(macros[f.key]);
      if (!Number.isFinite(v) || v < 0) {
        setLocalError('Renseigne les quatre macros (valeurs ≥ 0).');
        return;
      }
      payload[f.key] = v;
    }
    onSubmit(payload);
  }

  return (
    <form
      onSubmit={submit}
      data-testid="custom-food-form"
      className="mt-sm rounded-md border border-dashed border-accent/40 bg-bg/60 p-md"
    >
      <p className="mb-sm text-xs font-medium text-muted">Créer un aliment personnalisé</p>
      <input
        type="text"
        placeholder="Nom de l’aliment"
        aria-label="Nom de l’aliment personnalisé"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-sm w-full rounded-md border border-muted/30 bg-bg px-md py-sm text-text focus:border-accent focus:outline-none"
      />
      <div className="grid grid-cols-2 gap-sm">
        {CUSTOM_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-xs block text-xs text-muted">{f.label}</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              aria-label={f.label}
              value={macros[f.key]}
              onChange={(e) => setMacros((m) => ({ ...m, [f.key]: e.target.value }))}
              className="w-full rounded-md border border-muted/30 bg-bg px-sm py-sm text-text focus:border-accent focus:outline-none"
            />
          </div>
        ))}
      </div>
      {localError ? (
        <p role="alert" className="mt-sm text-xs text-danger">
          {localError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-md w-full rounded-md bg-accent px-md py-sm text-sm font-semibold text-bg disabled:opacity-50"
      >
        {busy ? 'Ajout…' : `Créer et ajouter (${round(grams) || 100} g)`}
      </button>
    </form>
  );
}

// ---- The "add food" control inside each meal card --------------------------
// A debounced search box, a grams field, and a result list. Selecting a result
// logs it; an empty search reveals the inline custom-food form. Closes itself
// after a successful log.
function AddFood({ slot, date, onLogged, onError }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [grams, setGrams] = useState('100');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const reqRef = useRef(0);

  // Debounced search. A bumped request id guards against out-of-order results.
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    const id = ++reqRef.current;
    const handle = setTimeout(() => {
      searchFoods({ q })
        .then((data) => {
          if (id !== reqRef.current) return;
          setResults(Array.isArray(data) ? data : []);
          setSearched(true);
        })
        .catch(() => {
          if (id !== reqRef.current) return;
          setResults([]);
          setSearched(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  function resetAndClose() {
    setBusy(false);
    setOpen(false);
    setQuery('');
    setResults([]);
    setSearched(false);
    setGrams('100');
    reqRef.current += 1;
  }

  async function logFood(body) {
    setBusy(true);
    try {
      await logEntry({ logged_on: date, slot, quantity_g: Number(grams) || 100, ...body });
      await onLogged();
      resetAndClose();
    } catch (err) {
      onError(err?.message ?? 'Échec de l’ajout.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="add-food-toggle"
        className="mt-sm w-full rounded-md border border-dashed border-muted/40 px-md py-sm text-sm font-medium text-accent hover:border-accent"
      >
        + Ajouter un aliment
      </button>
    );
  }

  const q = query.trim();
  const noResults = searched && q.length >= 2 && results.length === 0;

  return (
    <div data-testid="add-food" className="mt-sm rounded-md border border-muted/20 bg-bg/40 p-md">
      <div className="flex items-end gap-sm">
        <div className="flex-1">
          <label className="mb-xs block text-xs text-muted">Rechercher un aliment</label>
          <input
            type="text"
            autoFocus
            placeholder="Ex. flocons d’avoine"
            aria-label="Rechercher un aliment"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-muted/30 bg-bg px-md py-sm text-text focus:border-accent focus:outline-none"
          />
        </div>
        <div className="w-20">
          <label className="mb-xs block text-xs text-muted">Grammes</label>
          <input
            type="number"
            inputMode="decimal"
            step="1"
            min="1"
            aria-label="Quantité en grammes"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-full rounded-md border border-muted/30 bg-bg px-sm py-sm text-right text-text focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={resetAndClose}
          aria-label="Fermer la recherche"
          className="rounded-md px-sm py-sm text-lg leading-none text-muted hover:text-text"
        >
          ×
        </button>
      </div>

      {results.length > 0 ? (
        <ul className="mt-sm divide-y divide-muted/10">
          {results.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => logFood({ food_id: food.id })}
                data-testid="food-result"
                className="flex w-full items-center justify-between gap-md py-sm text-left hover:text-accent disabled:opacity-50"
              >
                <span className="flex-1 truncate text-sm text-text">{food.name}</span>
                <span className="text-xs text-muted">{round(food.kcal_per_100g)} kcal/100 g</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {q.length > 0 && q.length < 2 ? (
        <p className="mt-sm text-xs text-muted">Tape au moins deux lettres pour rechercher.</p>
      ) : null}

      {noResults ? (
        <>
          <p className="mt-sm text-xs text-muted">Aucun aliment trouvé pour « {q} ».</p>
          <CustomFoodForm
            initialName={q}
            grams={grams}
            busy={busy}
            onSubmit={(custom_food) => logFood({ custom_food })}
          />
        </>
      ) : null}
    </div>
  );
}

// ---- One meal-slot card -----------------------------------------------------
function MealCard({ slotMeta, slotData, date, onChange, onError }) {
  const entries = slotData?.entries ?? [];
  const subtotal = slotData?.subtotal ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

  return (
    <section
      data-testid="meal-card"
      data-slot={slotMeta.key}
      className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-text">{slotMeta.label}</h2>
        <span className="text-xs text-muted">
          {round(subtotal.kcal)} kcal · P {round(subtotal.protein_g)} · G {round(subtotal.carbs_g)}{' '}
          · L {round(subtotal.fat_g)}
        </span>
      </div>

      {entries.length > 0 ? (
        <div className="mt-md">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onChange={onChange} onError={onError} />
          ))}
        </div>
      ) : (
        <p className="mt-md text-sm text-muted">Aucun aliment pour ce repas.</p>
      )}

      <AddFood slot={slotMeta.key} date={date} onLogged={onChange} onError={onError} />
    </section>
  );
}

// ---- Load daily plan (US2, FR-010/FR-011) -----------------------------------
// Pre-fills the day from the program's template meal plan. An empty day loads
// silently; a non-empty day returns 409 LOAD_PLAN_CONFLICT, after which we surface
// a Remplacer / Ajouter choice and re-call with the chosen mode (never a silent
// overwrite). Any success refetches the whole day.
function LoadPlan({ date, onLoaded, onError }) {
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);

  async function run(mode) {
    setBusy(true);
    try {
      await loadPlan(date, mode);
      setConflict(false);
      await onLoaded();
    } catch (err) {
      if (err?.code === 'LOAD_PLAN_CONFLICT') {
        setConflict(true);
      } else {
        onError(err?.message ?? 'Échec du chargement du plan.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (conflict) {
    return (
      <div
        data-testid="load-plan-conflict"
        role="dialog"
        aria-label="Le journal contient déjà des aliments"
        className="rounded-lg border border-warn/40 bg-warn/10 p-lg shadow-sm"
      >
        <p className="text-sm font-medium text-text">Ce journal contient déjà des aliments.</p>
        <p className="mt-xs text-xs text-muted">
          Remplacer efface les aliments du jour avant de charger le plan. Ajouter conserve les
          aliments existants et ajoute le plan par-dessus.
        </p>
        <div className="mt-md flex flex-col gap-sm sm:flex-row">
          <button
            type="button"
            onClick={() => run('replace')}
            disabled={busy}
            data-testid="load-plan-replace"
            className="flex-1 rounded-md bg-accent px-md py-md text-sm font-semibold text-bg disabled:opacity-50"
          >
            Remplacer
          </button>
          <button
            type="button"
            onClick={() => run('append')}
            disabled={busy}
            data-testid="load-plan-append"
            className="flex-1 rounded-md border border-accent px-md py-md text-sm font-semibold text-accent disabled:opacity-50"
          >
            Ajouter
          </button>
          <button
            type="button"
            onClick={() => setConflict(false)}
            disabled={busy}
            className="rounded-md px-md py-md text-sm font-medium text-muted hover:text-text disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => run()}
      disabled={busy}
      data-testid="load-plan-toggle"
      className="w-full rounded-lg border border-dashed border-accent/40 px-md py-md text-sm font-semibold text-accent hover:border-accent disabled:opacity-50"
    >
      {busy ? 'Chargement…' : 'Charger le plan du jour'}
    </button>
  );
}

// ---- Hydration card (US3, FR-013) -------------------------------------------
// A circular gauge of total_ml vs goal_ml from the day view's hydration block,
// with one-tap quick-add buttons (+250 ml / +500 ml / +1 L) and an undo (−250 ml).
// Each control posts a signed delta then refetches the day; the backend clamps
// the running total at ≥ 0 so an over-eager undo can't go negative.
const HYDRATION_QUICK_ADDS = [
  { delta: 250, label: '+250 ml' },
  { delta: 500, label: '+500 ml' },
  { delta: 1000, label: '+1 L' },
];

function HydrationCard({ date, hydration, onChange, onError }) {
  const [busy, setBusy] = useState(false);
  const total = hydration?.total_ml ?? 0;
  const goal = hydration?.goal_ml ?? 0;

  async function adjust(deltaMl) {
    setBusy(true);
    try {
      await addHydration(date, deltaMl);
      await onChange();
    } catch (err) {
      onError(err?.message ?? 'Échec de la mise à jour de l’hydratation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="hydration-card"
      className="rounded-lg border border-surface bg-surface/40 p-lg shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-text">Hydratation</h2>
      </div>
      <div className="mt-md flex flex-col items-center gap-md sm:flex-row sm:items-center sm:gap-lg">
        <HydrationGauge total_ml={total} goal_ml={goal} />
        <div className="flex flex-1 flex-col gap-sm">
          <div className="grid grid-cols-3 gap-sm">
            {HYDRATION_QUICK_ADDS.map(({ delta, label }) => (
              <button
                key={delta}
                type="button"
                onClick={() => adjust(delta)}
                disabled={busy}
                data-testid={`hydration-add-${delta}`}
                className="rounded-md bg-accent px-md py-md text-sm font-semibold text-bg disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => adjust(-250)}
            disabled={busy || total <= 0}
            data-testid="hydration-undo"
            className="rounded-md border border-muted/40 px-md py-md text-sm font-medium text-muted hover:text-text disabled:opacity-50"
          >
            Annuler −250 ml
          </button>
        </div>
      </div>
    </section>
  );
}

export default function NutritionDay() {
  const [state, setState] = useState({ status: 'loading', data: null });
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getDay();
      setState({ status: 'ready', data });
    } catch {
      setState({ status: 'error', data: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Any mutation refetches the whole day so bars + subtotals stay in sync (FR-021).
  const refetch = useCallback(async () => {
    setError(null);
    await load();
  }, [load]);

  const day = state.data;
  const slotsByKey = {};
  for (const s of day?.slots ?? []) slotsByKey[s.slot] = s;

  return (
    <main className="mx-auto max-w-2xl px-lg py-lg">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text">Nutrition</h1>
        <p className="mt-xs text-muted">Journal du jour{day?.date ? ` — ${day.date}` : ''}.</p>
      </header>

      {state.status === 'loading' && <StateBlock kind="loading" />}
      {state.status === 'error' && (
        <StateBlock
          kind="error"
          title="Erreur"
          message="Impossible de charger le journal nutritionnel."
        />
      )}

      {state.status === 'ready' && (
        <>
          <div className="sticky top-0 z-10 mb-lg bg-bg/80 pb-sm pt-xs backdrop-blur">
            <DayBars bars={day?.bars} />
          </div>

          {error ? (
            <p role="alert" className="mb-md text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="mb-lg">
            <LoadPlan date={day?.date} onLoaded={refetch} onError={setError} />
          </div>

          <div className="mb-lg">
            <HydrationCard
              date={day?.date}
              hydration={day?.hydration}
              onChange={refetch}
              onError={setError}
            />
          </div>

          <div className="flex flex-col gap-lg">
            {SLOTS.map((slotMeta) => (
              <MealCard
                key={slotMeta.key}
                slotMeta={slotMeta}
                slotData={slotsByKey[slotMeta.key]}
                date={day?.date}
                onChange={refetch}
                onError={setError}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
