# Installation et exploitation — Logiciel Scolaire

Ce document décrit l'installation complète du logiciel sur un poste serveur (réseau local de
l'établissement), la création du premier administrateur, le démarrage, l'arrêt, la sauvegarde et la
restauration.

---

## 1. Prérequis

- **Node.js 20 ou supérieur** (testé avec Node 24)
- **MariaDB 10.11 ou 11.x** installé sur le poste serveur
- Un réseau local ; le poste serveur doit être joignable depuis les autres postes
- Windows / Linux / macOS (les commandes ci-dessous sont indiquées pour Windows et adaptées facilement)

---

## 2. Installation des dépendances

```bash
# Racine du projet (frontend Next.js)
npm install

# Backend Express
cd backend
npm install
```

---

## 3. Installation de MariaDB

### Windows (installateur officiel)

1. Télécharger MariaDB sur <https://mariadb.org/download/> (MSI).
2. Installer avec le mot de passe **root** (à conserver en lieu sûr).
3. Décocher « Expose MariaDB to network » si les postes clients n'accèdent qu'au serveur web
   (recommandé : MariaDB n'écoute que sur 127.0.0.1 du poste serveur).
4. Laisser le service `MariaDB` démarrer automatiquement.

### Linux (Ubuntu/Debian)

```bash
sudo apt install mariadb-server
sudo systemctl enable --now mariadb
sudo mysql_secure_installation
```

> **Sécurité :** MariaDB ne doit **jamais** être accessible depuis Internet. Le firewall de
> l'établissement doit bloquer le port 3306 depuis l'extérieur.

---

## 4. Création de la base et de l'utilisateur applicatif

Se connecter à MariaDB en root :

```bash
mariadb -u root -p
```

Exécuter (remplacer les mots de passe par des valeurs fortes) :

```sql
CREATE DATABASE scolaire CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Utilisateur applicatif à privilèges limités (pas de DROP/ALTER en usage nominal,
-- mais nécessaires aux migrations ; voir remarque ci-dessous)
CREATE USER 'scolaire_app'@'localhost' IDENTIFIED BY 'MOT_DE_PASSE_FORT';
CREATE USER 'scolaire_app'@'127.0.0.1' IDENTIFIED BY 'MOT_DE_PASSE_FORT';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON scolaire.* TO 'scolaire_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON scolaire.* TO 'scolaire_app'@'127.0.0.1';
FLUSH PRIVILEGES;
```

> Remarque : `CREATE/DROP/ALTER/INDEX` sont nécessaires pour l'exécuteur de migrations. En usage
> nominal, après migration, les privilèges peuvent être réduits à `SELECT, INSERT, UPDATE, DELETE`.

---

## 5. Configuration de l'environnement backend

```bash
cd backend
copy .env.example .env     # (Linux : cp .env.example .env)
```

Éditer `backend/.env` :

| Variable | Description |
|---|---|
| `PORT` | Port du backend (4000 par défaut) |
| `NODE_ENV` | `production` sur le serveur de l'établissement |
| `COOKIE_SECURE` | `true` si l'application est servie en HTTPS (recommandé en production) |
| `CORS_ORIGIN` | Origine du frontend (ex. `http://IP_SERVEUR:3000`) |
| `DB_HOST` / `DB_PORT` | 127.0.0.1 / 3306 |
| `DB_NAME` | `scolaire` |
| `DB_USER` / `DB_PASSWORD` | `scolaire_app` / mot de passe créé à l'étape 4 |
| `SESSION_TTL_HOURS` | Durée de vie des sessions (12 h par défaut) |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | Anti-force-brute (5 essais / 15 min) |

Le fichier `.env` est ignoré par Git (vérifié) : il ne doit jamais être commité.

---

## 6. Exécution des migrations

```bash
cd backend
npm run migrate
```

Le script applique les migrations `database/migrations/001…008` une seule fois chacune (journal
`schema_migrations`). Relancer la commande est sans effet si la base est à jour.

---

## 7. Création du premier administrateur

```bash
cd backend
npm run admin:create -- --username "directeur" --password "MotDePasseFort2026" --name "Nom du Directeur"
```

Règles appliquées par la commande :

- refuse si **un administrateur actif existe déjà** ;
- exige un mot de passe de 10 caractères minimum (minuscule + majuscule + chiffre) ;
- le mot de passe est haché (Argon2id) et **jamais affiché ni journalisé** ;
- les migrations sont exécutées automatiquement si nécessaire.

Une fois l'administrateur créé, les comptes supplémentaires se gèrent depuis l'interface
d'administration (menu Utilisateurs).

---

## 8. Démarrage

### Développement

```bash
# Terminal 1 — backend : http://127.0.0.1:4000
npm run backend:dev

# Terminal 2 — frontend : http://localhost:3000
npm run dev
```

ou, pour tester l'application de bureau (backend + frontend + Electron) :

```bash
npm run electron:dev
```

### Production

```bash
# Compilation
npm run build                 # frontend (Next.js standalone)
npm run backend:build         # backend -> backend/dist

# Démarrage
npm run backend:start         # API Express
npm run start                 # serveur Next.js
```

L'accès depuis les postes clients se fait via `http://IP_DU_SERVEUR:3000`.

### Application de bureau (Electron)

```bash
npm run electron:build        # génère l'installeur Windows (NSIS + portable)
```

L'installeur est déposé dans `dist-electron-v40/` (voir `scripts/organize-electron-output.js`).

---

## 9. Arrêt propre

- Backend : `Ctrl+C` dans le terminal (arrêt gracieux : purge des timers, fermeture du pool MariaDB).
- Next.js : `Ctrl+C`.
- MariaDB (Windows) : `net stop MariaDB`. (Linux) : `sudo systemctl stop mariadb`.

---

## 10. Sauvegarde

Sauvegarde logique complète (à faire quotidiennement, de préférence hors heures d'école) :

```bash
mariadb-dump -u scolaire_app -p --single-transaction --routines --triggers scolaire > sauvegarde_scolaire_2026-01-15.sql
```

Conserver les fichiers de sauvegarde sur **un autre support** (disque externe, NAS) et vérifier
régulièrement qu'ils sont restaurables. Aucune sauvegarde automatique n'est configurée par ce
dépôt : mettre en place une tâche planifiée (Windows Task Scheduler / cron) avec la commande
ci-dessus si besoin.

---

## 11. Restauration

```bash
mariadb -u root -p -e "CREATE DATABASE IF NOT EXISTS scolaire CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mariadb -u scolaire_app -p scolaire < sauvegarde_scolaire_2026-01-15.sql
```

Puis redémarrer le backend et vérifier la santé : `http://127.0.0.1:4000/api/v1/health`
(`"database": "ok"`).

---

## 12. Diagnostic des erreurs courantes

| Symptôme | Cause probable | Action |
|---|---|---|
| `/api/v1/health` renvoie `database: "injoignable"` | MariaDB arrêté ou `.env` erroné | Vérifier le service MariaDB et les identifiants `DB_*` |
| `503 DB_ACCESS_DENIED` | Mauvais mot de passe `scolaire_app` | Corriger `backend/.env`, redémarrer le backend |
| `503 DB_NOT_FOUND` | Base `scolaire` inexistante | Créer la base (étape 4) puis `npm run migrate` |
| Connexion refusée sur le frontend | Backend arrêté | Démarrer `npm run backend:dev` (ou `backend:start`) |
| `Trop de tentatives` à la connexion | Anti-force-brute déclenché | Attendre `LOGIN_LOCK_MINUTES` (15 min par défaut) |
| Session perdue immédiatement | `COOKIE_SECURE=true` sans HTTPS | Passer l'application en HTTPS ou repasser `COOKIE_SECURE=false` |

---

## 13. Sécurité — récapitulatif

- Mots de passe hachés **Argon2id** (`@node-rs/argon2`), jamais en clair.
- Sessions serveur révocables, cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` en HTTPS).
- Limitation des tentatives de connexion (5 essais / 15 min par utilisateur et par IP).
- Permissions vérifiées **côté serveur** sur chaque route protégée.
- Requêtes SQL 100 % paramétrées ; `multipleStatements` désactivé sur le pool applicatif.
- Journal d'audit en insertion seule (aucune route de modification/suppression).
- CORS restreint à l'origine du frontend configurée.
- MariaDB réservé au réseau local, idéalement à `127.0.0.1` du poste serveur.
