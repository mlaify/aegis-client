import { NavLink, Outlet, useLocation } from "react-router-dom";

const NAV = [
  { to: "/inbox", label: "Inbox" },
  { to: "/compose", label: "Compose" },
  { to: "/identity", label: "Identity" },
  { to: "/setup", label: "Setup" },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-aegis-accent font-mono text-sm font-bold text-slate-900">
              Æ
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Aegis</h1>
              <p className="aegis-mono">v0.3-alpha · web client</p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    "rounded-md px-3 py-1.5 text-sm font-medium transition",
                    isActive
                      ? "bg-aegis-accent/10 text-aegis-accentDeep dark:text-aegis-accent"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Outlet key={location.pathname} />
      </main>

      <footer className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-slate-500 dark:text-slate-500">
          <span>
            Aegis is a draft post-quantum messaging protocol. This web client
            is local-dev alpha software and not production-ready.
          </span>
          <a
            className="hover:text-aegis-accentDeep dark:hover:text-aegis-accent"
            href="https://github.com/mlaify/aegis-spec"
            target="_blank"
            rel="noreferrer"
          >
            spec
          </a>
        </div>
      </footer>
    </div>
  );
}
