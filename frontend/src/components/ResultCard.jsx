export default function ResultCard({ title, children, footnote }) {
  return (
    <section className="bg-surface rounded-lg p-lg shadow-md">
      {title ? <h2 className="text-xl font-semibold mb-md">{title}</h2> : null}
      <div className="text-text">{children}</div>
      {footnote ? <p className="mt-md text-sm text-muted">{footnote}</p> : null}
    </section>
  );
}
