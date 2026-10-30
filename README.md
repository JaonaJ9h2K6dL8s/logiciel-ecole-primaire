# Logiciel Scolaire

Application de gestion scolaire (école primaire, Madagascar). Ce dépôt contient le **socle technique** préparé après nettoyage complet de l'ancien projet. Aucun module fonctionnel n'est encore développé.

## Architecture

| Couche | Technologie | Emplacement |
|---|---|---|
| Frontend | React 19 + TypeScript + Next.js 15 (App Router) + MUI 7 | `src/` |
| Backend | Node.js + TypeScript + Express, API versionnée `/api/v1` | `backend/` |
| Base de données | MariaDB (migrations versionnées) | `database/` |
| Bureau | Electron (enveloppe de l'application web) | `main.js`, `electron/` |

## Structure

```
src/                  Frontend Next.js (React + TS + MUI)
  app/                Pages App Router
  components/         Composants réutilisables (à créer)
  services/           Client API vers /api/v1 (à créer)
  stores/             État global (zustand)
  theme/              Thème MUI
backend/              API Express
  src/config/         Configuration (variables d'environnement)
  src/routes/         Routes API (démarré avec /api/v1/health)
database/
  migrations/         Migrations versionnées MariaDB
  seeds/              Données de démonstration (séparées des données réelles)
scripts/              Outils de build Electron
```

## Configuration backend

```bash
cd backend
cp .env.example .env   # puis adapter DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
```

Le fuseau horaire de référence est `Indian/Antananarivo`.

## Démarrage en développement

```bash
# Frontend (Next.js) — http://localhost:3000
npm run dev

# Backend (Express) — http://127.0.0.1:4000/api/v1/health
npm run backend:dev

# Application de bureau (démarre next sur le port 3099 puis Electron)
npm run electron:dev
```

## Build production

```bash
npm run backend:build        # compile le backend dans backend/dist
npm run electron:build       # build Next + préparation standalone + installeur Windows
```

## Étapes du projet

L'étape 1 (socle + module Administrateur) sera développée après validation du nettoyage. Les modules suivants (élèves, professeurs, classes, présences, notes, bulletins, etc.) viendront ensuite.
