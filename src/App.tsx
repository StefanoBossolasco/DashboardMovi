import { createContext, useContext, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { useConfig } from './hooks';
import { DEFAULT_CONFIG } from './lib/modd';
import type { Config } from './lib/types';
import CalendarPage from './pages/Calendar';
import PrimaNota from './pages/PrimaNota';
import Riconciliazione from './pages/Riconciliazione';
import Rendiconto from './pages/Rendiconto';
import Eventi from './pages/Eventi';
import EventoDetail from './pages/EventoDetail';
import Impostazioni from './pages/Impostazioni';

const ConfigCtx = createContext<Config>(DEFAULT_CONFIG);
export const useAppConfig = () => useContext(ConfigCtx);

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const NAV: { to: string; label: string; short: string; icon: ReactNode; admin: boolean }[] = [
  { to: '/calendario', label: 'Calendario spazi', short: 'Spazi', admin: true, icon: icon('M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z') },
  { to: '/prima-nota', label: 'Prima nota', short: 'Prima nota', admin: true, icon: icon('M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7') },
  { to: '/riconciliazione', label: 'Riconciliazione', short: 'Banca', admin: true, icon: icon('M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18') },
  { to: '/rendiconto', label: 'Rendiconto', short: 'Rendiconto', admin: true, icon: icon('M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3') },
  { to: '/eventi', label: 'Eventi', short: 'Eventi', admin: false, icon: icon('M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 19v-1a4 4 0 0 0-3-3.8M15.5 4.2a3 3 0 0 1 0 5.6') },
  { to: '/impostazioni', label: 'Impostazioni', short: 'Altro', admin: true, icon: icon('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4') },
];

function Wordmark() {
  return <img className="logo" src="/MoviLogo.png" alt="Movimento Giovanile" width="519" height="167" />;
}

function Login() {
  const { signIn, error } = useAuth();
  return (
    <div className="center-screen">
      <div className="login-card">
        <Wordmark />
        <h1>Dashboard</h1>
        <p className="muted">Gestione di spazi, prima nota ed eventi del circolo.</p>
        <button className="btn primary big" onClick={signIn}>
          Accedi con Google
        </button>
        {error && <div className="error-box">{error}</div>}
      </div>
    </div>
  );
}

function Denied() {
  const { email, signOut } = useAuth();
  return (
    <div className="center-screen">
      <div className="login-card">
        <h1>Accesso non abilitato</h1>
        <p className="muted">
          L'account <strong>{email}</strong> non è tra quelli autorizzati. Chiedi a un amministratore di aggiungerti
          da Impostazioni → Utenti. Se sei offline, riprova con la connessione attiva.
        </p>
        <button className="btn" onClick={signOut}>
          Esci e cambia account
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { status, user, isAdmin, signOut } = useAuth();
  const { config } = useConfig(status === 'ok' && isAdmin);

  if (status === 'loading') return <div className="center-screen muted">Caricamento…</div>;
  if (status === 'out') return <Login />;
  if (status === 'denied' || !user) return <Denied />;

  const items = NAV.filter((n) => isAdmin || !n.admin);
  const home = isAdmin ? '/calendario' : '/eventi';

  return (
    <ConfigCtx.Provider value={config}>
      <div className="shell">
        <aside className="sidebar">
          <NavLink to={home} className="brand">
            <Wordmark />
          </NavLink>
          <nav>
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                {n.icon}
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="who">
              <strong>{user.name}</strong>
              <span>{isAdmin ? 'Amministratore' : 'Collaboratore'}</span>
            </div>
            <button className="btn small" onClick={signOut}>
              Esci
            </button>
          </div>
        </aside>

        <header className="topbar">
          <NavLink to={home} className="brand">
            <Wordmark />
          </NavLink>
          <button className="btn small" onClick={signOut}>
            Esci
          </button>
        </header>

        <main className="main">
          <Routes>
            {isAdmin && (
              <>
                <Route path="/calendario" element={<CalendarPage />} />
                <Route path="/prima-nota" element={<PrimaNota />} />
                <Route path="/riconciliazione" element={<Riconciliazione />} />
                <Route path="/rendiconto" element={<Rendiconto />} />
                <Route path="/impostazioni" element={<Impostazioni />} />
              </>
            )}
            <Route path="/eventi" element={<Eventi />} />
            <Route path="/eventi/:id" element={<EventoDetail />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </main>

        {items.length > 1 && (
          <nav className="bottomnav">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `bn-item${isActive ? ' active' : ''}`}>
                {n.icon}
                <span>{n.short}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </ConfigCtx.Provider>
  );
}
