// Phase 10 (013-phase10-dashboard) T031 — the smart-alert list on the dashboard.
// Renders up to three prioritized alerts from `data.alerts` as severity-styled cards,
// each linking to its in-app target (`alert.link`), or an encouraging all-clear state
// when there is nothing to flag. PURELY a presentation surface — the backend owns the
// alert selection, priority order (≤ 3), `message_key`, `link`, and `context`.
//
// Strings/locale seam: like the Phase 9 RecoveryAlerts `ALERT_COPY` map and the Phase 8
// WeeklyGrid `CELL_LABEL` map, French copy is a local lookup keyed by the stable
// `message_key` (with a per-`kind` fallback), so the component hardcodes no English and
// the backend owns the message keys. Some copy bodies are functions of `alert.context`
// so the dynamic numbers (days since last session, calorie delta) reach the athlete.

import { Link } from 'react-router-dom';

// French copy keyed by the alert's stable `message_key` (the locale seam). `body` may be
// a string or a `(context) => string` so context numbers surface in the message.
const ALERT_COPY = {
  'dashboard.alert.low_sleep_high_stress': {
    title: 'Sommeil bas, stress élevé',
    body: 'Ta récupération est dans le rouge ces derniers jours. Lève le pied et soigne ton sommeil.',
  },
  'dashboard.alert.no_session': {
    title: 'Aucune séance récente',
    body: (ctx) =>
      ctx?.days
        ? `Pas de séance terminée depuis ${ctx.days} jour${ctx.days > 1 ? 's' : ''}. C'est le moment de reprendre.`
        : "Tu n'as pas terminé de séance récemment. C'est le moment de reprendre.",
  },
  'dashboard.alert.calorie_deficit': {
    title: 'Déficit calorique',
    body: (ctx) =>
      Number.isFinite(ctx?.delta_kcal)
        ? `Hier, il te manquait ${Math.abs(Math.round(ctx.delta_kcal))} kcal pour atteindre ta cible. Pense à manger assez pour progresser.`
        : "Hier tu étais sous ta cible calorique. Pense à manger assez pour progresser.",
  },
  'dashboard.alert.ready_to_add_load': {
    title: 'Prêt à charger',
    body: "Tes derniers résultats montrent que tu peux augmenter la charge sur certains exercices. Vas-y !",
  },
  'dashboard.alert.creatine_streak_broken': {
    title: 'Série de créatine rompue',
    body: "Tu as manqué ta créatine. Relance ta série dès aujourd'hui pour rester régulier.",
  },
};

// Fallback copy by alert `kind`, in case an unknown `message_key` arrives.
const KIND_COPY = {
  low_sleep_high_stress: ALERT_COPY['dashboard.alert.low_sleep_high_stress'],
  no_session: ALERT_COPY['dashboard.alert.no_session'],
  calorie_deficit: ALERT_COPY['dashboard.alert.calorie_deficit'],
  ready_to_add_load: ALERT_COPY['dashboard.alert.ready_to_add_load'],
  creatine_streak_broken: ALERT_COPY['dashboard.alert.creatine_streak_broken'],
};

// Each alert kind maps to a severity, then severity → shared design tokens. The three
// cautionary kinds lean on the danger token; the two positive/nudge kinds use accent.
const KIND_SEVERITY = {
  low_sleep_high_stress: 'warning',
  no_session: 'warning',
  calorie_deficit: 'warning',
  ready_to_add_load: 'success',
  creatine_streak_broken: 'advice',
};

const SEVERITY_TONE = {
  warning: 'border-danger/40 bg-danger/10',
  success: 'border-success/40 bg-success/10',
  advice: 'border-accent/40 bg-accent/10',
};

const SEVERITY_LABEL = { warning: 'À surveiller', success: 'Bonne nouvelle', advice: 'Conseil' };
const SEVERITY_ICON = { warning: '⚠️', success: '🎯', advice: '💡' };

function copyFor(alert) {
  const entry = ALERT_COPY[alert.message_key] ?? KIND_COPY[alert.kind] ?? {
    title: alert.kind ?? 'Alerte',
    body: '',
  };
  const body = typeof entry.body === 'function' ? entry.body(alert.context) : entry.body;
  return { title: entry.title, body };
}

export default function AlertList({ data }) {
  if (!data) return null;
  // The endpoint caps alerts at three; defend in the UI all the same.
  const alerts = (data.alerts ?? []).slice(0, 3);

  if (alerts.length === 0) {
    return (
      <section
        data-testid="dashboard-alerts"
        data-all-clear="true"
        className="rounded-lg border border-success/40 bg-success/10 p-lg text-text shadow-sm"
      >
        <div className="flex items-center gap-md">
          <span aria-hidden="true" className="text-2xl">
            ✅
          </span>
          <div>
            <h2 className="text-base font-semibold">Tout roule</h2>
            <p className="text-sm text-muted">Aucune alerte aujourd'hui. Continue comme ça !</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="dashboard-alerts"
      data-all-clear="false"
      className="flex flex-col gap-md"
    >
      {alerts.map((alert, i) => {
        const severity = KIND_SEVERITY[alert.kind] ?? 'advice';
        const tone = SEVERITY_TONE[severity] ?? SEVERITY_TONE.advice;
        const { title, body } = copyFor(alert);
        const card = (
          <div className="flex items-start gap-sm">
            <span aria-hidden="true" className="text-xl leading-none">
              {SEVERITY_ICON[severity] ?? SEVERITY_ICON.advice}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-sm">
                <h3 className="text-sm font-semibold text-text">{title}</h3>
                <span className="rounded-full border border-current/30 px-sm py-px text-[10px] uppercase tracking-wide text-muted">
                  {SEVERITY_LABEL[severity] ?? severity}
                </span>
              </div>
              {body ? <p className="mt-xs text-sm text-muted">{body}</p> : null}
            </div>
            {alert.link ? (
              <span aria-hidden="true" className="self-center text-muted">
                ›
              </span>
            ) : null}
          </div>
        );

        const baseClass = `block rounded-lg border p-md shadow-sm transition ${tone}`;
        const key = alert.message_key ?? `${alert.kind}-${i}`;

        return alert.link ? (
          <Link
            key={key}
            to={alert.link}
            data-testid="dashboard-alert"
            data-kind={alert.kind}
            data-severity={severity}
            className={`${baseClass} hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent/50`}
          >
            {card}
          </Link>
        ) : (
          <article
            key={key}
            data-testid="dashboard-alert"
            data-kind={alert.kind}
            data-severity={severity}
            className={baseClass}
          >
            {card}
          </article>
        );
      })}
    </section>
  );
}
