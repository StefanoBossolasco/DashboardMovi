import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Configurazione web del progetto Firebase (non e' un segreto: l'accesso ai dati
// e' protetto dalle regole in firestore.rules).
const firebaseConfig = {
  apiKey: 'AIzaSyCgJV58bxMZo6bP4WSY5LWAVJyejz4jM14',
  authDomain: 'dashboardmovi.firebaseapp.com',
  projectId: 'dashboardmovi',
  storageBucket: 'dashboardmovi.firebasestorage.app',
  messagingSenderId: '588855471902',
  appId: '1:588855471902:web:76dc34b94e9631507aa30f',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
