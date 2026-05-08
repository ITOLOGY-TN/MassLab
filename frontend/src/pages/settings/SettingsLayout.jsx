import { NavLink, Outlet } from 'react-router-dom';

const SECTIONS = [
  { to: '/settings/profile', label: 'Profil' },
  { to: '/settings/schedule', label: 'Planning' },
  { to: '/settings/exercises', label: 'Exercices' },
  { to: '/settings/preferences', label: 'Préférences' },
  { to: '/settings/data', label: 'Données' },
];

export default function SettingsLayout() {
  return (
    <main className="min-h-full p-lg">
      <header className="mb-lg">
        <h1 className="text-3xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted">
          Gérez votre profil, votre planning, vos exercices, vos préférences et vos données.
        </p>
      </header>
      <div className="grid gap-lg md:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections">
          <ul className="flex md:flex-col gap-xs overflow-x-auto md:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.to}>
                <NavLink
                  to={s.to}
                  className={({ isActive }) =>
                    `block min-h-[44px] px-md py-sm rounded-md whitespace-nowrap ${
                      isActive
                        ? 'bg-accent text-white'
                        : 'text-muted hover:text-text hover:bg-surface'
                    }`
                  }
                >
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <section className="bg-surface rounded-lg p-lg shadow">
          <Outlet />
        </section>
      </div>
    </main>
  );
}
