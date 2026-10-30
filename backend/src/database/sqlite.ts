import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

/**
 * Adaptateur SQLite compatible avec la surface mysql2 utilisée par le projet.
 *
 * Objectif : remplacer MariaDB par SQLite (fichier local) sans réécrire les
 * modules métier. Le pool exposé ici imite l'API consommée :
 *  - pool.query(sql, params) -> [rows | header, fields]
 *  - pool.getConnection() -> conn.query / beginTransaction / commit / rollback / release
 *  - withTransaction (défini dans pool.ts)
 *
 * Compatibilité SQL gérée :
 *  - Fonctions enregistrées : NOW(), CURDATE(), DATE_FORMAT(), CONCAT()
 *  - Réécritures : "FOR UPDATE" (no-op), INSERT IGNORE -> INSERT OR IGNORE,
 *    DATE_ADD/DATE_SUB(... INTERVAL n UNIT) -> datetime(..., '±n unit'),
 *    INSERT ... ON DUPLICATE KEY UPDATE -> INSERT ... ON CONFLICT(...) DO UPDATE
 *    (cible dérivée de la clé primaire / des index uniques de la table).
 *  - Dates : les objets Date sont écrits en heure Indian/Antananarivo (UTC+3),
 *    comme le pool mysql2 (timezone '+03:00').
 */

const APP_TZ_OFFSET_MS = 3 * 3600 * 1000;

/** Formate un instant en "AAAA-MM-JJ HH:MM:SS" heure malgache (convention time.ts). */
function formatTs(d: Date): string {
  return new Date(d.getTime() + APP_TZ_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/** Fonctions scalaires MySQL utilisées par le code, enregistrées côté SQLite. */
function registerFunctions(db: Database.Database): void {
  db.function('NOW', () => formatTs(new Date()));
  db.function('CURDATE', () => formatTs(new Date()).slice(0, 10));
  // MySQL CHAR_LENGTH (contraintes CHECK) : équivalent LENGTH en SQLite
  db.function('CHAR_LENGTH', (v: unknown) => (v === null || v === undefined ? null : String(v).length));
  db.function('CHARACTER_LENGTH', (v: unknown) => (v === null || v === undefined ? null : String(v).length));
  // MySQL IF(cond, a, b) : équivalent iif en SQLite
  db.function('IF', (cond: unknown, a: unknown, b: unknown) => (cond ? a : b));
  db.function('CONCAT', (...args: unknown[]) => {
    if (args.some((a) => a === null || a === undefined)) return null;
    return args.map((a) => String(a)).join('');
  });
  db.function('DATE_FORMAT', (value: unknown, fmt: unknown) => {
    if (value === null || value === undefined || fmt === null || fmt === undefined) return null;
    let iso: string;
    if (value instanceof Date) iso = formatTs(value);
    else {
      const s = String(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = `${s} 00:00:00`;
      else if (/^\d{4}-\d{2}-\d{2}T/.test(s)) iso = `${s.slice(0, 10)} ${s.slice(11, 19) || '00:00:00'}`;
      else iso = s.slice(0, 19).replace('T', ' ');
    }
    const d = { Y: iso.slice(0, 4), m: iso.slice(5, 7), d: iso.slice(8, 10), H: iso.slice(11, 13), i: iso.slice(14, 16), s: iso.slice(17, 19) };
    return String(fmt).replace(/%([YmdHis])/g, (_, k: keyof typeof d) => d[k] ?? '');
  });
  // MySQL TIME_FORMAT(time, fmt) : time = "HH:MM:SS" (ou datetime complet).
  db.function('TIME_FORMAT', (value: unknown, fmt: unknown) => {
    if (value === null || value === undefined || fmt === null || fmt === undefined) return null;
    const s = String(value);
    const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const t = { H: m[1].padStart(2, '0'), i: m[2], s: (m[3] ?? '00') };
    return String(fmt).replace(/%([His])/g, (_, k: keyof typeof t) => t[k] ?? '');
  });
  // MySQL TIME_TO_SEC(time) : secondes écoulées depuis minuit.
  db.function('TIME_TO_SEC', (value: unknown) => {
    if (value === null || value === undefined) return null;
    const m = String(value).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  });
}

/* ------------------------------------------------------------------ */
/* Traduction des migrations MySQL -> SQLite (DDL et DML statiques)    */
/* ------------------------------------------------------------------ */

/** Convertit un fichier de migration MySQL en SQL SQLite. */
export function translateMysqlToSqlite(input: string): string {
  let sql = input;

  // Directives MySQL sans objet en SQLite
  sql = sql.replace(/^\s*SET\s+[A-Za-z_]+\s*=.*$/gim, '');

  // Types
  sql = sql.replace(/\bTINYINT\s*\(\s*1\s*\)/gi, 'INTEGER');
  sql = sql.replace(/\b(TINYINT|SMALLINT|MEDIUMINT|INTEGER|INT|BIGINT)\b(\s*\(\s*\d+\s*\))?(\s+UNSIGNED)?/gi, 'INTEGER');
  sql = sql.replace(/\b(VARCHAR|CHAR)\s*\(\s*\d+\s*\)/gi, 'TEXT');
  sql = sql.replace(/\b(MEDIUMTEXT|LONGTEXT|TINYTEXT)\b/gi, 'TEXT');
  sql = sql.replace(/\bENUM\s*\([^)]*\)/gi, 'TEXT');
  sql = sql.replace(/\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'NUMERIC');
  sql = sql.replace(/\b(DOUBLE|FLOAT)(\s*\(\s*\d+\s*(,\s*\d+\s*)?\))?/gi, 'REAL');
  sql = sql.replace(/\bJSON\b/gi, 'TEXT');
  sql = sql.replace(/\b(BOOLEAN|BOOL)\b/gi, 'INTEGER');
  sql = sql.replace(/\b(DATETIME|TIMESTAMP)\s*\(\s*\d+\s*\)/gi, 'TEXT');
  sql = sql.replace(/\b(DATETIME|TIMESTAMP)\b/gi, 'TEXT');
  sql = sql.replace(/\bDATE\b(?!\s*\()/gi, 'TEXT');

  // Commentaires MySQL (colonne et table)
  sql = sql.replace(/\s+COMMENT\s+'(?:[^']|'')*'/gi, '');

  // Horodatages par défaut (heure locale application, cf. NOW())
  sql = sql.replace(/ON\s+UPDATE\s+CURRENT_TIMESTAMP(\s*\(\s*\d+\s*\))?/gi, '');
  sql = sql.replace(/DEFAULT\s+CURRENT_TIMESTAMP(\s*\(\s*\d+\s*\))?/gi, "DEFAULT (datetime('now','localtime'))");

  // Clauses de table MySQL
  sql = sql.replace(/\s+CHARACTER\s+SET\s+\w+/gi, '');
  sql = sql.replace(/\s+COLLATE\s+\w+/gi, '');
  sql = sql.replace(/\)\s*ENGINE=[^;]*;/g, ');');

  // Index FULLTEXT MySQL : sans équivalent direct requis ici ; un index
  // standard offre la même fonctionnalité de recherche aux volumes de l'école.
  sql = sql.replace(/\bCREATE\s+FULLTEXT\s+INDEX\b/gi, 'CREATE INDEX');

  // AUTO_INCREMENT : les deux formes du projet
  sql = sql.replace(/\bAUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, 'PRIMARY KEY AUTOINCREMENT');
  sql = sql.replace(/\bAUTO_INCREMENT\b/gi, 'PRIMARY KEY AUTOINCREMENT');

  // PRIMARY KEY (id) redondant après auto-incrémentation inline
  sql = removeRedundantInlinePkId(sql);

  // UNIQUE KEY nom (cols) -> UNIQUE (cols) dans le corps des tables
  sql = sql.replace(/\bUNIQUE\s+KEY\s+\w+\s*\(([^)]*)\)/gi, 'UNIQUE ($1)');

  // ALTER TABLE compatibles
  sql = translateAlterStatements(sql);

  return sql;
}

/** Supprime les "PRIMARY KEY (id)" des tables dont l'id est déjà PRIMARY KEY AUTOINCREMENT. */
function removeRedundantInlinePkId(sql: string): string {
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(/gi;
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const bodyStart = m.index + m[0].length;
    const close = findClosingParen(sql, bodyStart);
    if (close === -1) break;
    const body = sql.slice(bodyStart, close);
    if (/\bPRIMARY\s+KEY\s+AUTOINCREMENT\b/i.test(body)) {
      const newBody = body.replace(/\s*,?\s*PRIMARY\s+KEY\s*\(\s*[`"]?id[`"]?\s*\)/gi, '');
      out.push(sql.slice(last, bodyStart), newBody);
      last = close;
    }
  }
  out.push(sql.slice(last));
  return out.join('');
}

/** Index de la parenthèse fermant la parenthèse ouverte à la position donnée (commentaires ignorés).
 * openIdx pointe APRÈS la parenthèse ouvrante : depth démarre donc à 1. */
function findClosingParen(s: string, openIdx: number): number {
  let depth = 1;
  let inStr = false;
  let inLineComment = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (!inStr && c === '-' && s[i + 1] === '-') { inLineComment = true; continue; }
    if (inStr) {
      if (c === "'" && s[i + 1] === "'") { i++; continue; }
      if (c === "'") inStr = false;
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Découpe une liste d'actions ALTER séparées par des virgules de premier niveau. */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "'" && s[i + 1] === "'") { i++; continue; }
      if (c === "'") inStr = false;
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Traduit les ALTER TABLE du projet (ADD COLUMN / ADD INDEX / ADD UNIQUE KEY / MODIFY / ADD FOREIGN KEY). */
function translateAlterStatements(sql: string): string {
  return sql.replace(/ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+([\s\S]*?);/gi, (_full, table: string, actions: string) => {
    const stmts: string[] = [];
    for (const raw of splitTopLevel(actions, ',')) {
      const action = raw.trim().replace(/\bIF\s+NOT\s+EXISTS\b/gi, '').trim();
      let m: RegExpExecArray | null;
      if ((m = /^ADD\s+COLUMN\s+([\s\S]+)$/i.exec(action))) {
        let def = m[1].replace(/\s+AFTER\s+[`"]?\w+[`"]?\s*$/i, '');
        def = def.replace(/(\w+)\s+DEFAULT\s+(TRUE|FALSE)/gi, (_x, col: string, v: string) => `${col} DEFAULT ${v === 'TRUE' ? '1' : '0'}`);
        stmts.push(`ALTER TABLE ${table} ADD COLUMN ${def}`);
      } else if ((m = /^ADD\s+(?:UNIQUE\s+KEY|UNIQUE\s+INDEX|UNIQUE)\s+(\w+)\s*\(([^)]*)\)/i.exec(action))) {
        stmts.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${m[1]} ON ${table} (${m[2]})`);
      } else if ((m = /^ADD\s+(?:KEY|INDEX)\s+(\w+)\s*\(([^)]*)\)/i.exec(action))) {
        stmts.push(`CREATE INDEX IF NOT EXISTS ${m[1]} ON ${table} (${m[2]})`);
      } else if (/^ADD\s+FOREIGN\s+KEY/i.test(action)) {
        // SQLite ne gère pas l'ajout de clé étrangère après coup : contrainte
        // garantie par la logique applicative, on ignore cette action.
        continue;
      } else if (/^MODIFY\b/i.test(action)) {
        // MODIFY (ex. élargissement d'ENUM) : sans objet en SQLite, la colonne est TEXT.
        continue;
      } else if (/^ADD\s+CONSTRAINT/i.test(action)) {
        continue;
      } else if (/^DROP/i.test(action)) {
        // Aucun DROP dans les migrations du projet ; conservé par sécurité.
        stmts.push(`ALTER TABLE ${table} ${action}`);
      }
    }
    return stmts.length ? `${stmts.join(';\n')};\n` : '';
  });
}

/* ------------------------------------------------------------------ */
/* Découpage et exécution des fichiers de migration                    */
/* ------------------------------------------------------------------ */

/** Découpe un script SQL en instructions (sensible aux chaînes et commentaires). */
export function splitSqlStatements(script: string): string[] {
  const stmts: string[] = [];
  let cur = '';
  let inStr = false;
  let inLineComment = false;
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    const next = script[i + 1];
    if (inLineComment) {
      cur += c;
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (!inStr && c === '-' && next === '-') { inLineComment = true; cur += c; continue; }
    if (inStr) {
      cur += c;
      if (c === "'" && next === "'") { cur += next; i++; continue; }
      if (c === "'") inStr = false;
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === ';') {
      if (cur.trim()) stmts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) stmts.push(cur.trim());
  return stmts;
}

/* ------------------------------------------------------------------ */
/* Réécriture des requêtes applicatives (dialecte runtime)             */
/* ------------------------------------------------------------------ */

function uniqueCandidates(db: Database.Database, table: string): string[][] {
  const candidates: string[][] = [];
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; pk: number }>;
  const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  if (pk.length) candidates.push(pk);
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string; unique: number; origin: string }>;
  for (const idx of indexes) {
    if (!idx.unique || idx.origin === 'pk') continue;
    const info = db.prepare(`PRAGMA index_info(${idx.name})`).all() as Array<{ name: string }>;
    const idxCols = info.map((c) => c.name).filter(Boolean);
    if (idxCols.length) candidates.push(idxCols);
  }
  return candidates;
}

/** Choisit la cible de conflit pour un upsert (sémantique "n'importe quelle clé unique" de MySQL). */
function conflictTarget(db: Database.Database, table: string, sql: string): string[] {
  const candidates = uniqueCandidates(db, table);
  if (!candidates.length) {
    throw new Error(`SQLite upsert impossible : aucune clé unique sur ${table}`);
  }
  const listMatch = /INSERT\s+INTO\s+[`"]?\w+[`"]?\s*\(([^)]*)\)/i.exec(sql);
  if (listMatch) {
    const insertCols = listMatch[1].split(',').map((c) => c.trim().replace(/[`"]/g, '').toLowerCase());
    const fitting = candidates.filter((c) => c.every((col) => insertCols.includes(col.toLowerCase())));
    if (fitting.length) return fitting.sort((a, b) => b.length - a.length)[0];
  }
  return candidates[0];
}

/**
 * Copie de même longueur où chaînes et commentaires '--' sont remplacés par
 * des espaces : permet de localiser les marqueurs SQL hors commentaires.
 */
function maskCommentsAndStrings(sql: string): string {
  const out = sql.split('');
  let i = 0;
  let inStr = false;
  let inLine = false;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === '\n') inLine = false;
      else out[i] = ' ';
      i++;
      continue;
    }
    if (inStr) {
      if (c === "'" && n === "'") { i += 2; continue; } // apostrophe échappée : conservée masquée
      if (c === "'") { inStr = false; }
      out[i] = ' ';
      i++;
      continue;
    }
    if (c === '-' && n === '-') { inLine = true; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
    if (c === "'") { inStr = true; out[i] = ' '; i++; continue; }
    i++;
  }
  return out.join('');
}

/** Cherche une regex hors chaînes et commentaires ('--' en début de ligne). */
function findOutsideComments(sql: string, re: RegExp): { index: number; length: number } | null {
  const masked = maskCommentsAndStrings(sql);
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  const m = global.exec(masked);
  if (!m) return null;
  return { index: m.index, length: m[0].length };
}

/**
 * Convertit les littéraux entre guillemets doubles ("...") en littéraux
 * entre apostrophes : MySQL les accepte comme chaînes, SQLite non
 * (SQLITE_DQS désactivé). Les chaînes '...' sont respectées.
 */
function convertDoubleQuotedStrings(sql: string): string {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < sql.length) {
    const c = sql[i];
    if (inStr) {
      out += c;
      if (c === "'" && sql[i + 1] === "'") { out += "'"; i += 2; continue; }
      if (c === "'") inStr = false;
      i++;
      continue;
    }
    if (c === "'") { inStr = true; out += c; i++; continue; }
    if (c === '"') {
      // Lit le littéral "..." et le re-émet en '...' (doublage des ')
      let j = i + 1;
      let content = '';
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') { content += '"'; j += 2; continue; }
        if (sql[j] === '"') break;
        content += sql[j];
        j++;
      }
      out += `'${content.replace(/'/g, "''")}'`;
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Réécrit une requête applicative MySQL en SQLite (mémoïsée par requête). */
export function makeQueryRewriter(db: Database.Database): (sql: string) => string {
  const cache = new Map<string, string>();
  return (sql: string): string => {
    const cached = cache.get(sql);
    if (cached !== undefined) return cached;
    let out = sql;
    out = out.replace(/\bFOR\s+UPDATE\b/gi, '');
    // CURRENT_TIMESTAMP en SQLite est UTC ; MariaDB écrivait en heure locale (+03:00).
    out = out.replace(/(?<!DEFAULT\s)\bCURRENT_TIMESTAMP\b/gi, "datetime('now','localtime')");
    out = out.replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT OR IGNORE');
    out = convertDoubleQuotedStrings(out);
    out = out.replace(
      /\bDATE_(ADD|SUB)\s*\(\s*([^,]+?)\s*,\s*INTERVAL\s+(-?\d+)\s+(DAY|MONTH|YEAR|HOUR|MINUTE|SECOND|WEEK)\s*\)/gi,
      (_m, fn: string, expr: string, n: string, unit: string) =>
        `datetime(${expr}, '${fn.toUpperCase() === 'DATE_ADD' ? '+' : '-'}${n} ${unit.toLowerCase()}')`
    );
    const upsert = findOutsideComments(out, /ON\s+DUPLICATE\s+KEY\s+UPDATE/i);
    if (upsert) {
      const tableMatch = /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+[`"]?(\w+)[`"]?/i.exec(out);
      if (!tableMatch) throw new Error('SQLite upsert : table cible introuvable');
      const target = conflictTarget(db, tableMatch[1], out).map((c) => `"${c}"`).join(', ');
      const head = out.slice(0, upsert.index);
      let tail = out.slice(upsert.index + upsert.length);
      tail = tail.replace(/\bVALUES\s*\(\s*[`"]?(\w+)[`"]?\s*\)/gi, 'excluded."$1"');
      out = `${head}ON CONFLICT(${target}) DO UPDATE SET${tail}`;
    }
    cache.set(sql, out);
    return out;
  };
}

/* ------------------------------------------------------------------ */
/* Pool SQLite compatible mysql2                                       */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

/** Sérialise un paramètre pour better-sqlite3 (Date / booléen / undefined). */
function toSqlParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return formatTs(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function serializeParams(params: unknown[]): unknown[] {
  return params.map(toSqlParam);
}

/**
 * Normalise les erreurs better-sqlite3 vers les codes mysql2 attendus par les
 * modules (isDupEntry -> ER_DUP_ENTRY, FK -> ER_NO_REFERENCED_ROW_2, ...).
 * Sans cette traduction, un doublon remonte en 500 au lieu d'un 409/400.
 */
function normalizeSqliteError(err: unknown): unknown {
  const code = (err as { code?: string }).code;
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    let mapped = code;
    if (code.includes('UNIQUE')) mapped = 'ER_DUP_ENTRY';
    else if (code.includes('FOREIGN KEY')) mapped = 'ER_NO_REFERENCED_ROW_2';
    else if (code.includes('CHECK')) mapped = 'ER_CHECK_CONSTRAINT_VIOLATED';
    try { (err as { code?: string }).code = mapped; } catch { /* figé */ }
  }
  return err;
}

export class SqliteConn {
  constructor(private db: Database.Database, private rewriter: (sql: string) => string) {}

  async query<R = Row>(sql: string, params: unknown[] = []): Promise<[R[], unknown[]]> {
    const [result] = await this.raw(sql, params);
    return [result as unknown as R[], []];
  }

  execute<R = Row>(sql: string, params: unknown[] = []): Promise<[R[], unknown[]]> {
    return this.query<R>(sql, params);
  }

  /** Exécution brute : SELECT -> lignes, écriture -> en-tête mysql2-like. */
  private raw(sql: string, params: unknown[]): Promise<[Row | { insertId: number; affectedRows: number; changedRows: number }, unknown[]]> {
    const stmt = this.rewriter(sql).trim();
    if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(stmt)) {
      let rows: Row[];
      try {
        rows = this.db.prepare(stmt).all(...serializeParams(params)) as Row[];
      } catch (err) {
        throw normalizeSqliteError(err);
      }
      return Promise.resolve([rows as unknown as Row, []]);
    }
    if (/^\s*(CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK|VACUUM|ANALYZE)/i.test(stmt)) {
      try {
        this.db.exec(stmt);
      } catch (err) {
        throw normalizeSqliteError(err);
      }
      return Promise.resolve([{ insertId: 0, affectedRows: 0, changedRows: 0 }, []]);
    }
    let info: Database.RunResult;
    try {
      info = this.db.prepare(stmt).run(...serializeParams(params));
    } catch (err) {
      throw normalizeSqliteError(err);
    }
    return Promise.resolve([
      { insertId: Number(info.lastInsertRowid), affectedRows: info.changes, changedRows: info.changes },
      [],
    ]);
  }

  async beginTransaction(): Promise<void> {
    this.db.exec('BEGIN IMMEDIATE');
  }

  async commit(): Promise<void> {
    this.db.exec('COMMIT');
  }

  async rollback(): Promise<void> {
    try {
      this.db.exec('ROLLBACK');
    } catch {
      // transaction déjà clôturée
    }
  }

  release(): void {
    // Connection unique synchrone : rien à libérer.
  }

  async ping(): Promise<void> {
    this.db.prepare('SELECT 1').get();
  }

  /** Exécute un script multi-instructions (migrations uniquement). */
  execScript(script: string): void {
    for (const stmt of splitSqlStatements(script)) {
      const rewritten = this.rewriter(stmt);
      // Les commentaires en tête ne gênent pas SQLite mais la classification si ;
      // une instruction réduite à des commentaires (ALTER ignoré) est sautée.
      const bare = rewritten.replace(/^(?:\s*--[^\n]*\n?)+/, '').trim();
      if (!bare) continue;
      if (/^\s*(CREATE|ALTER|DROP)/i.test(bare)) this.db.exec(rewritten);
      else this.db.prepare(rewritten).run();
    }
  }
}

export class SqlitePool {
  private db: Database.Database;
  private rewriter: (sql: string) => string;
  private txChain: Promise<unknown> = Promise.resolve();

  constructor() {
    const file = env.db.file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    registerFunctions(this.db);
    this.rewriter = makeQueryRewriter(this.db);
  }

  get database(): Database.Database {
    return this.db;
  }

  query<R = Row>(sql: string, params: unknown[] = []): Promise<[R[], unknown[]]> {
    const conn = new SqliteConn(this.db, this.rewriter);
    return conn.query<R>(sql, params);
  }

  execute<R = Row>(sql: string, params: unknown[] = []): Promise<[R[], unknown[]]> {
    return this.query<R>(sql, params);
  }

  async getConnection(): Promise<SqliteConn> {
    return new SqliteConn(this.db, this.rewriter);
  }

  /**
   * Transactions sérialisées : better-sqlite3 est synchrone, on chaîne les
   * transactions pour éviter qu'un autre traitement n'entre dans une
   * transaction déjà ouverte.
   */
  withTransaction<T>(fn: (conn: SqliteConn) => Promise<T>): Promise<T> {
    const run = this.txChain.then(async () => {
      const conn = new SqliteConn(this.db, this.rewriter);
      await conn.beginTransaction();
      try {
        const result = await fn(conn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      }
    });
    this.txChain = run.then(
      () => undefined,
      () => undefined
    );
    return run as Promise<T>;
  }

  async check(): Promise<boolean> {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
