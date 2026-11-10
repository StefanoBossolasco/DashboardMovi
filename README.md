# Dashboard Movi

Gestionale del Circolo ACLI Movimento Giovanile: calendario spazi, prima nota, riconciliazione con estratto conto e
fatture, rendiconto per cassa (Mod. D) ed eventi con partecipanti e pagamenti.

React + Vite + Firebase (Authentication con Google, Firestore). Funziona da computer e da telefono.

## Avvio in locale

```bash
npm install
npm run dev
```

Poi apri http://localhost:5173.

## Configurazione Firebase (una volta sola)

1. **Authentication → Metodo di accesso**: abilita Google.
2. **Firestore Database → Regole**: incolla il contenuto di `firestore.rules` e pubblica.
3. Quando l'app sarà online, aggiungi il dominio in **Authentication → Impostazioni → Domini autorizzati**.

Il primo amministratore è l'email indicata in `firestore.rules` (`bootstrapAdmin`). Gli altri utenti si aggiungono
dall'app, in Impostazioni → Utenti.

## Ruoli

- **Amministratore**: vede e modifica tutto.
- **Collaboratore**: vede solo gli eventi su cui è abilitato; lì gestisce i partecipanti e aggiunge spese.

## Dati (raccolte Firestore)

| Raccolta | Contenuto |
| --- | --- |
| `users/{email}` | nome e ruolo |
| `settings/config` | spazi, sottogruppi e relative voci del Mod. D |
| `bookings` | prenotazioni degli spazi |
| `movements` | prima nota (con eventuali `bankTxId`, `invoiceId`, `eventId`) |
| `bankTx` | righe dell'estratto conto importate |
| `invoices` | fatture importate |
| `events/{id}/participants` | eventi e partecipanti |

## Pubblicazione

`npm run build` crea la cartella `dist/`, pubblicabile su Firebase Hosting o qualsiasi hosting statico.
