import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import type { AppUser } from './lib/types';

type Status = 'loading' | 'out' | 'denied' | 'ok';

interface AuthState {
  status: Status;
  user: AppUser | null;
  email: string;
  isAdmin: boolean;
  error: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AppUser | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(
    () =>
      onAuthStateChanged(auth, async (fb) => {
        if (!fb || !fb.email) {
          setUser(null);
          setEmail('');
          setStatus('out');
          return;
        }
        const mail = fb.email.toLowerCase();
        setEmail(mail);
        setStatus('loading');
        const ref = doc(db, 'users', mail);
        try {
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setUser({ ...(snap.data() as AppUser), email: mail });
            setStatus('ok');
            return;
          }
          // Primo accesso dell'amministratore iniziale: le regole lo consentono solo a lui.
          const first: AppUser = { email: mail, name: fb.displayName || mail, role: 'admin' };
          await setDoc(ref, first);
          setUser(first);
          setStatus('ok');
        } catch {
          setUser(null);
          setStatus('denied');
        }
      }),
    [],
  );

  const signIn = async () => {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setError(
        code === 'auth/operation-not-allowed'
          ? 'L\'accesso con Google non è ancora attivo nel progetto Firebase (Authentication → Metodo di accesso).'
          : code === 'auth/unauthorized-domain'
            ? 'Questo indirizzo non è tra i domini autorizzati in Firebase Authentication.'
            : `Accesso non riuscito (${code || 'errore sconosciuto'}).`,
      );
    }
  };

  return (
    <Ctx.Provider
      value={{
        status,
        user,
        email,
        isAdmin: user?.role === 'admin',
        error,
        signIn,
        signOut: () => fbSignOut(auth),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
