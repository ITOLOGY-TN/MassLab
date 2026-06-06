// Phase 10 (013-phase10-dashboard) T036 — the quote-of-the-day dashboard tile.
// Renders the daily motivational quote from `data.quote` ({ text, author? }), stable
// within a calendar day and rotating daily (backend `quotes.pickToday`). The tile is
// PURELY READ-ONLY display: it never writes and shows a graceful placeholder when no
// quote exists (cold start / empty catalogue, FR-018) rather than disappearing.

export default function QuoteCard({ data }) {
  const quote = data?.quote ?? null;
  const text = quote?.text?.trim() ?? '';

  if (!text) {
    return (
      <section
        data-testid="dashboard-quote"
        data-empty="true"
        className="rounded-lg border border-border bg-surface p-lg text-text shadow-sm"
      >
        <p className="text-sm text-muted">Pas de citation du jour pour le moment.</p>
      </section>
    );
  }

  const author = quote?.author?.trim() ?? '';

  return (
    <section
      data-testid="dashboard-quote"
      data-empty="false"
      className="rounded-lg border border-border bg-surface p-lg text-text shadow-sm"
    >
      <span aria-hidden="true" className="mb-sm block text-3xl leading-none text-accent">
        “
      </span>
      <blockquote className="text-base font-medium leading-relaxed text-text">{text}</blockquote>
      {author ? <p className="mt-sm text-sm text-muted">— {author}</p> : null}
    </section>
  );
}
