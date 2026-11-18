# Salomé

Appli mobile (PWA, iPhone et Android) pour suivre à distance un commerce (maquis, restaurant, boutique).

- **Propriétaire** : recette en direct, indice de confiance, alertes anti-fraude, dépenses à valider, vérification des ventes auprès des clients, paie selon les présences, rappels, factures, journal.
- **Gérant·e** : ventes (espèces, Wave, Orange Money, MTN, Moov), reçu client, dépenses avec photo, stock, pointage avec photo, clôture de caisse à l'aveugle.

## Lancer

```bash
npm install
npm run dev          # développement
npm run build        # version à héberger (Vercel détecte Vite tout seul)
npm run build:single # un seul fichier HTML autonome (démo)
```

## Serveur (Supabase)

1. Dans Supabase, SQL Editor : coller `supabase/schema.sql`, puis Run (une seule fois).
2. Authentication, Sign In / Providers : activer « Allow anonymous sign-ins » (connexion des gérant·es par code).
3. Variables (facultatives, valeurs par défaut dans `src/sync.ts`) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Fonctionnement

- Hors ligne d'abord : tout est enregistré sur le téléphone (IndexedDB), puis envoyé au serveur dès que le réseau revient.
- Temps réel : les changements de l'autre téléphone arrivent en direct (Supabase Realtime).
- Anti-triche côté serveur : aucune suppression possible, la gérante ne peut pas modifier une clôture, une dépense ou un mouvement de stock déjà envoyés, et chaque version est gardée dans `record_history`.
- Mode démo : données fictives locales (codes 1111 propriétaire, 2222 gérante).
