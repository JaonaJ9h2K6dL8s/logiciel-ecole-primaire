import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest, notFound } from '../../shared/errors';
import {
  requireStudentZone,
  setStudentZoneCookie,
  clearStudentZoneCookie,
} from './student-session';

// backend/data : répertoire de ressources locales (livres, coloriages, œuvres)
const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const BOOKS_DIR = path.join(DATA_DIR, 'student-books');
const COLORING_DIR = path.join(DATA_DIR, 'coloring');
const ARTIFACTS_DIR = path.join(DATA_DIR, 'artifacts', 'student-artworks');

export const studentsZoneRouter = Router();

const loginSchema = z.object({ studentId: z.number().int().positive() });

/** Nom complet lisible pour l'élève. */
function fullName(s: { first_names: string; last_name: string }): string {
  return `${s.first_names} ${s.last_name}`.trim();
}

// ---------------------------------------------------------------------------
// Accès (public)
// ---------------------------------------------------------------------------

studentsZoneRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Identifiant élève requis.', parsed.error.flatten().fieldErrors);
    }
    const [rows] = await getPool().query(
      `SELECT s.id, s.first_names, s.last_name, c.name AS class_name
       FROM students s
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON c.id = e.class_id
       WHERE s.id = ? AND s.status = 'active'
       ORDER BY e.id DESC
       LIMIT 1`,
      [parsed.data.studentId]
    );
    const student = (rows as { id: number; first_names: string; last_name: string; class_name: string | null }[])[0];
    if (!student) {
      throw notFound('Élève introuvable.');
    }
    setStudentZoneCookie(res, student.id);
    res.json({ id: student.id, fullName: fullName(student), className: student.class_name });
  })
);

studentsZoneRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    clearStudentZoneCookie(res);
    res.json({ ok: true });
  })
);

studentsZoneRouter.get(
  '/classes',
  asyncHandler(async (_req, res) => {
    const [rows] = await getPool().query(
      `SELECT id, name FROM classes WHERE is_active = 1 ORDER BY name`
    );
    res.json({ classes: rows as { id: number; name: string }[] });
  })
);

studentsZoneRouter.get(
  '/students',
  asyncHandler(async (req, res) => {
    const classId = Number(req.query.classId);
    if (!Number.isInteger(classId) || classId <= 0) {
      throw badRequest('Classe invalide.');
    }
    const [rows] = await getPool().query(
      `SELECT s.id, s.first_names, s.last_name
       FROM students s
       JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       WHERE e.class_id = ? AND s.status = 'active'
       ORDER BY s.last_name, s.first_names`,
      [classId]
    );
    res.json({
      students: (rows as { id: number; first_names: string; last_name: string }[]).map((s) => ({
        id: s.id,
        fullName: fullName(s),
      })),
    });
  })
);

// ---------------------------------------------------------------------------
// Bibliothèque de livres
// ---------------------------------------------------------------------------

interface BookManifestEntry {
  id: string;
  slug: string;
  title: string;
  level: string;
  pages: number;
  coverColor: string;
}

studentsZoneRouter.get(
  '/books',
  asyncHandler(async (_req, res) => {
    const manifestPath = path.join(BOOKS_DIR, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BookManifestEntry[];
    res.json({ books: manifest });
  })
);

/** Page de livre : SVG inline ou image (PNG) servie par l'API. */
type BookPage = { type: 'svg'; content: string } | { type: 'image'; url: string };

const PAGE_FILE_RE = /^page-(\d+)\.(svg|png)$/;

studentsZoneRouter.get(
  '/books/:slug/pages',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw badRequest('Identifiant de livre invalide.');
    }
    const dir = path.join(BOOKS_DIR, slug);
    if (!fs.existsSync(dir)) {
      throw notFound('Livre introuvable.');
    }
    // Regroupe par numéro de page : le SVG (illustration + texte) est prioritaire
    // sur le PNG (illustration seule) s'ils coexistent.
    const pages = new Map<number, BookPage>();
    for (const f of fs.readdirSync(dir)) {
      const m = PAGE_FILE_RE.exec(f);
      if (!m) continue;
      const n = Number(m[1]);
      const existing = pages.get(n);
      if (m[2] === 'svg') {
        pages.set(n, { type: 'svg', content: fs.readFileSync(path.join(dir, f), 'utf8') });
      } else if (!existing) {
        pages.set(n, { type: 'image', url: `/api/v1/students-zone/books/${slug}/pages/${n}/image` });
      }
    }
    res.json({
      pages: [...pages.entries()].sort(([a], [b]) => a - b).map(([, p]) => p),
    });
  })
);

studentsZoneRouter.get(
  '/books/:slug/pages/:n/image',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug ?? '');
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw badRequest('Identifiant de livre invalide.');
    }
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n <= 0) {
      throw badRequest('Numéro de page invalide.');
    }
    const file = path.join(BOOKS_DIR, slug, `page-${n}.png`);
    if (!file.startsWith(BOOKS_DIR) || !fs.existsSync(file)) {
      throw notFound('Page introuvable.');
    }
    res.type('image/png').send(fs.readFileSync(file));
  })
);

// ---------------------------------------------------------------------------
// Coloriage
// ---------------------------------------------------------------------------

studentsZoneRouter.get(
  '/coloring-pages',
  asyncHandler(async (_req, res) => {
    const entries = fs
      .readdirSync(COLORING_DIR)
      .filter((f) => f.endsWith('.svg'))
      .sort()
      .map((f) => {
        const id = f.replace(/\.svg$/, '');
        return { id, name: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ') };
      });
    res.json({ pages: entries });
  })
);

studentsZoneRouter.get(
  '/coloring/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id ?? '');
    // Validation stricte : pas de traversal de chemin possible.
    if (!/^[a-z0-9-]+$/.test(id)) {
      throw badRequest('Identifiant de coloriage invalide.');
    }
    const file = path.join(COLORING_DIR, `${id}.svg`);
    if (!file.startsWith(COLORING_DIR) || !fs.existsSync(file)) {
      throw notFound('Coloriage introuvable.');
    }
    res.type('image/svg+xml').send(fs.readFileSync(file, 'utf8'));
  })
);

// ---------------------------------------------------------------------------
// Œuvres d'élèves (session élève requise)
// ---------------------------------------------------------------------------

const MAX_PNG_BYTES = 3 * 1024 * 1024; // ~3 Mo décodés

const artworkSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis.').max(120),
  dataUrl: z.string().startsWith('data:image/png;base64,', 'Image PNG attendue.'),
});

studentsZoneRouter.get(
  '/artworks',
  requireStudentZone,
  asyncHandler(async (req, res) => {
    const studentId = req.studentZone!.studentId;
    const [rows] = await getPool().query(
      `SELECT id, title, created_at FROM student_artworks WHERE student_id = ? ORDER BY id DESC`,
      [studentId]
    );
    res.json({
      artworks: (rows as { id: number; title: string; created_at: string }[]).map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
      })),
    });
  })
);

studentsZoneRouter.post(
  '/artworks',
  requireStudentZone,
  asyncHandler(async (req, res) => {
    const parsed = artworkSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('Dessin invalide.', parsed.error.flatten().fieldErrors);
    }
    const base64 = parsed.data.dataUrl.slice('data:image/png;base64,'.length);
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_PNG_BYTES) {
      throw badRequest('Image trop grande (3 Mo maximum).');
    }
    const studentId = req.studentZone!.studentId;
    const dir = path.join(ARTIFACTS_DIR, String(studentId));
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `${crypto.randomUUID()}.png`;
    fs.writeFileSync(path.join(dir, fileName), buffer);
    const [result] = await getPool().query(
      `INSERT INTO student_artworks (student_id, title, image_path) VALUES (?, ?, ?)`,
      [studentId, parsed.data.title, `${studentId}/${fileName}`]
    );
    res.json({ id: (result as { insertId: number }).insertId });
  })
);

studentsZoneRouter.get(
  '/artworks/:id/file',
  requireStudentZone,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw badRequest('Identifiant invalide.');
    }
    const [rows] = await getPool().query(
      `SELECT student_id, image_path FROM student_artworks WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = (rows as { student_id: number; image_path: string }[])[0];
    if (!row) throw notFound('Dessin introuvable.');
    // Validation de propriété : un élève ne voit que SES œuvres.
    if (row.student_id !== req.studentZone!.studentId) {
      throw notFound('Dessin introuvable.');
    }
    const file = path.join(ARTIFACTS_DIR, row.image_path);
    if (!file.startsWith(ARTIFACTS_DIR) || !fs.existsSync(file)) {
      throw notFound('Fichier introuvable.');
    }
    res.type('image/png').send(fs.readFileSync(file));
  })
);
