import { useEffect, useState } from 'react';
import { doc, onSnapshot, type Query } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_CONFIG } from './lib/modd';
import type { Config } from './lib/types';

export interface ColState<T> {
  data: T[];
  loading: boolean;
  error: string;
}

/** Ascolta in tempo reale una query; passare null per non caricare nulla */
export function useCol<T>(make: () => Query | null, deps: unknown[]): ColState<T> {
  const [state, setState] = useState<ColState<T>>({ data: [], loading: true, error: '' });
  useEffect(() => {
    const q = make();
    if (!q) {
      setState({ data: [], loading: false, error: '' });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: '' }));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T),
          loading: false,
          error: '',
        }),
      (err) => setState({ data: [], loading: false, error: describeError(err) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function describeError(err: unknown): string {
  const code = (err as { code?: string }).code || '';
  if (code === 'permission-denied')
    return 'Permesso negato: controlla che le regole di firestore.rules siano pubblicate nella console Firebase.';
  if (code === 'unavailable') return 'Connessione assente: riprova quando sei online.';
  return (err as Error).message || 'Errore imprevisto.';
}

/** Spazi e sottogruppi (solo amministratori): se non ancora salvati usa i predefiniti */
export function useConfig(enabled: boolean): { config: Config; loading: boolean } {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(enabled);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'settings', 'config'),
      (snap) => {
        const d = snap.data() as Partial<Config> | undefined;
        setConfig({
          spaces: d?.spaces?.length ? d.spaces : DEFAULT_CONFIG.spaces,
          subgroups: d?.subgroups?.length ? d.subgroups : DEFAULT_CONFIG.subgroups,
        });
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [enabled]);
  return { config, loading };
}

export function useIsMobile(): boolean {
  const mq = '(max-width: 760px)';
  const [m, setM] = useState(() => window.matchMedia(mq).matches);
  useEffect(() => {
    const l = window.matchMedia(mq);
    const on = () => setM(l.matches);
    l.addEventListener('change', on);
    return () => l.removeEventListener('change', on);
  }, []);
  return m;
}
