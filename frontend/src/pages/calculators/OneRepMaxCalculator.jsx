import { useState } from 'react';
import { apiPost } from '../../lib/api.js';
import NumberField from '../../components/NumberField.jsx';
import ResultCard from '../../components/ResultCard.jsx';

export default function OneRepMaxCalculator() {
  const [form, setForm] = useState({ weight_kg: 80, reps: 5 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiPost('/api/v1/calculators/one-rep-max', form);
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-h-full p-lg max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold mb-lg">1RM — Estimation</h1>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-md mb-lg">
        <NumberField
          label="Charge (kg)"
          name="weight_kg"
          value={form.weight_kg}
          onChange={set('weight_kg')}
          step={0.5}
          required
        />
        <NumberField
          label="Répétitions"
          name="reps"
          value={form.reps}
          onChange={set('reps')}
          min={1}
          max={30}
          required
        />
        <div className="col-span-2">
          <button type="submit" className="bg-accent text-bg rounded-md px-lg py-sm font-semibold">
            Calculer
          </button>
        </div>
      </form>
      {error ? (
        <ResultCard title="Erreur">
          <p className="text-danger">{error}</p>
        </ResultCard>
      ) : null}
      {result ? (
        <>
          <ResultCard
            title="Estimation"
            footnote={result.reduced_confidence ? '⚠ Confiance réduite (reps > 10).' : null}
          >
            <p className="text-3xl font-semibold mb-md">{result.primary_estimate_kg} kg</p>
            <dl className="grid grid-cols-2 gap-sm text-sm">
              <dt className="text-muted">Epley</dt>
              <dd>{result.epley_kg} kg</dd>
              <dt className="text-muted">Brzycki</dt>
              <dd>{result.brzycki_kg} kg</dd>
              <dt className="text-muted">Lander</dt>
              <dd>{result.lander_kg} kg</dd>
              <dt className="text-muted">Lombardi</dt>
              <dd>{result.lombardi_kg} kg</dd>
            </dl>
          </ResultCard>
          <div className="mt-lg">
            <ResultCard title="Table des pourcentages">
              <table className="w-full text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="text-left py-xs">% du 1RM</th>
                    <th className="text-left py-xs">Charge</th>
                    <th className="text-left py-xs">Reps</th>
                  </tr>
                </thead>
                <tbody>
                  {result.percentage_table.map((row) => (
                    <tr key={row.pct} className="border-t border-muted/20">
                      <td className="py-xs">{row.pct} %</td>
                      <td className="py-xs">{row.load_kg} kg</td>
                      <td className="py-xs">
                        {row.reps_low}–{row.reps_high}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResultCard>
          </div>
        </>
      ) : null}
    </main>
  );
}
