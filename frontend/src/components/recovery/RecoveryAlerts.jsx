// Phase 9 (012-phase9-recovery-wellbeing) T025 — the smart recovery alert banner.
// Renders the engine-derived alerts as severity-styled cards, or an encouraging
// all-clear state when nothing needs attention (FR-016/data-model §5b). The alert
// data comes from GET /recovery/alerts as { all_clear, alerts:[{kind, severity,
// message_key, context}] }; advisory only — never alters a plan.
//
// Strings/locale seam: like the Phase 8 WeeklyGrid `CELL_LABEL` map, French copy is a
// local lookup keyed by `message_key` (with a per-kind fallback), so the component
// hardcodes no English and the backend owns the message keys.

// French copy keyed by the alert's stable `message_key` (the locale seam).
const ALERT_COPY = {
  'recovery.alert.high_stress': {
    title: 'Stress élevé',
    body: 'Ton stress reste élevé depuis plusieurs jours. Pense à lever le pied et à soigner ta récupération.',
  },
  'recovery.alert.reduce_volume': {
    title: 'Réduis le volume',
    body: 'Sommeil et énergie sont bas ces derniers jours. Allège tes prochaines séances.',
  },
  'recovery.alert.full_rest': {
    title: 'Repos complet conseillé',
    body: 'Plusieurs signaux de fatigue sont au rouge. Une journée de repos total serait bénéfique.',
  },
};

// Fallback copy by alert `kind`, in case an unknown message_key arrives.
const KIND_COPY = {
  high_stress: ALERT_COPY['recovery.alert.high_stress'],
  reduce_volume: ALERT_COPY['recovery.alert.reduce_volume'],
  full_rest: ALERT_COPY['recovery.alert.full_rest'],
};

// Severity → Tailwind tones on the shared design tokens. `warning` leans on the
// danger token (no dedicated warning token); `advice` uses the accent token.
const SEVERITY_TONE = {
  warning: 'border-danger/40 bg-danger/10 text-text',
  advice: 'border-accent/40 bg-accent/10 text-text',
};

const SEVERITY_LABEL = { warning: 'Alerte', advice: 'Conseil' };
const SEVERITY_ICON = { warning: '⚠️', advice: '💡' };

function copyFor(alert) {
  return (
    ALERT_COPY[alert.message_key] ??
    KIND_COPY[alert.kind] ?? { title: alert.kind ?? 'Alerte', body: '' }
  );
}

export default function RecoveryAlerts({ data }) {
  if (!data) return null;
  const alerts = data.alerts ?? [];
  const allClear = data.all_clear ?? alerts.length === 0;

  if (allClear) {
    return (
      <section
        data-testid="recovery-alerts"
        data-all-clear="true"
        className="rounded-lg border border-success/40 bg-success/10 p-lg text-text shadow-sm"
      >
        <div className="flex items-center gap-md">
          <span aria-hidden="true" className="text-2xl">
            ✅
          </span>
          <div>
            <h2 className="text-base font-semibold">Tout est au vert</h2>
            <p className="text-sm text-muted">
              Aucune alerte de récupération. Continue comme ça !
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="recovery-alerts" data-all-clear="false" className="flex flex-col gap-md">
      {alerts.map((alert, i) => {
        const severity = alert.severity ?? 'advice';
        const tone = SEVERITY_TONE[severity] ?? SEVERITY_TONE.advice;
        const { title, body } = copyFor(alert);
        return (
          <article
            key={alert.message_key ?? `${alert.kind}-${i}`}
            data-testid="recovery-alert"
            data-kind={alert.kind}
            data-severity={severity}
            className={`rounded-lg border p-md shadow-sm ${tone}`}
          >
            <div className="flex items-start gap-sm">
              <span aria-hidden="true" className="text-xl leading-none">
                {SEVERITY_ICON[severity] ?? SEVERITY_ICON.advice}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-sm">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <span className="rounded-full border border-current/30 px-sm py-px text-[10px] uppercase tracking-wide text-muted">
                    {SEVERITY_LABEL[severity] ?? severity}
                  </span>
                </div>
                {body ? <p className="mt-xs text-sm text-muted">{body}</p> : null}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
