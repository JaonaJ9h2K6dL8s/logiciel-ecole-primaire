/**
 * Tests RÉELS de l'orchestrateur multi-IA (aucune simulation de succès).
 *
 * Usage :
 *   node scripts/test-orchestrator.cjs
 *   TEST_TEACHER_USER=prof TEST_TEACHER_PASS=... node scripts/test-orchestrator.cjs
 *
 * Prérequis : backend démarré sur http://localhost:4000, Ollama lancé avec
 * llama3.1:8b. Les identifiants prof viennent de TEST_TEACHER_USER /
 * TEST_TEACHER_PASS (aucun mot de passe n'est stocké en clair dans le projet).
 *
 * Étapes couvertes :
 *  (a) GET /status — liste réelle des fournisseurs (ollama disponible, cloud "no-key")
 *  (b) 4 chats prof via Ollama (fallback final) avec subject/level détectés
 *  (c) isolation prof/élève (404 dans les deux sens)
 *  (d) quota élève : lecture directe de ai_usage_daily après quelques appels
 *      (pas de spam de 30 appels : on documente le compteur)
 *  (e) fallback : arrêt d'Ollama → erreur propre « aucun fournisseur
 *      disponible » (503, pas de crash), puis relance d'Ollama.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:4000/api/v1';

let teacherCookie = '';
let studentCookie = '';
const results = [];
function report(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` : ${detail}` : ''}`);
}

async function call(method, path, body, cookie, expectError) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non JSON */ }
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  // (a) /status — route de diagnostic (session prof requise)
  const user = process.env.TEST_TEACHER_USER ?? 'prof';
  const pass = process.env.TEST_TEACHER_PASS;
  if (!pass) {
    console.error('Définis TEST_TEACHER_USER et TEST_TEACHER_PASS (compte prof existant).');
    process.exit(1);
  }
  const login = await call('POST', '/auth/login', { username: user, password: pass });
  const setCookie = login.headers.get('set-cookie') ?? '';
  teacherCookie = setCookie.split(';')[0];
  if (login.status !== 200 || !teacherCookie) {
    report('(0) login prof', false, `HTTP ${login.status}`);
    process.exit(1);
  }
  report('(0) login prof', true, user);

  const status = await call('GET', '/ai-orchestrator/status', null, teacherCookie);
  const cloudNoKey = (status.data?.providers ?? []).filter((p) => !p.hasKey).map((p) => p.id);
  const ollama = (status.data?.providers ?? []).find((p) => p.id === 'ollama');
  report('(a) /status ollama disponible', status.status === 200 && ollama?.available === true, JSON.stringify(ollama));
  report('(a) /status 8 cloud no-key', cloudNoKey.length === 8, cloudNoKey.join(','));

  // (b) 4 questions prof — sans clé cloud, la réponse DOIT venir d'Ollama
  const questions = [
    ['math CE2', 'Calcule 34 + 28, explique à un élève de CE2', 'math', 'CE2'],
    ['français CM1', 'Donne deux exercices de conjugaison au présent pour un élève de CM1', 'francais', 'CM1'],
    ['sciences CE1', 'Explique simplement pourquoi il faut boire de l’eau, à un élève de CE1', 'sciences', 'CE1'],
    ['hors domaine', 'Qui a gagné le match de foot hier soir ?', null, null],
  ];
  let teacherConversationId = null;
  for (const [name, q, expectSubject, expectLevel] of questions) {
    const r = await call('POST', '/ai-orchestrator/chat', { message: q }, teacherCookie);
    const ok =
      r.status === 200 &&
      typeof r.data?.reply === 'string' &&
      r.data.reply.length > 0 &&
      /ollama/i.test(r.data.provider ?? '');
    const detail = `provider=${r.data?.provider} subject=${r.data?.subject} level=${r.data?.level} status=${r.status}`;
    report(`(b) chat prof « ${name} »`, ok, detail);
    if (expectSubject && r.status === 200) report(`(b) classification « ${name} »`, r.data.subject === expectSubject, `subject=${r.data.subject}`);
    if (expectLevel && r.status === 200) report(`(b) niveau « ${name} »`, r.data.level === expectLevel, `level=${r.data.level}`);
    if (name === 'hors domaine' && r.status === 200) {
      const refus = /désol|pas|hors|scolaire|plutôt|aide/i.test(r.data.reply ?? '');
      report('(b) refus poli hors domaine', refus, (r.data.reply ?? '').slice(0, 120));
    }
    if (r.data?.conversationId && name === 'math CE2') teacherConversationId = r.data.conversationId;
  }

  // (c) isolation prof/élève
  // Session élève Mila (ELV-900001, données de test migration 032)
  const studentLogin = await call('POST', '/students-zone/login', { studentId: null });
  // le login élève nécessite l'id réel : on le lit via /students-zone/students?classId=...
  const classes = await call('GET', '/students-zone/classes', null, null);
  let studentId = null;
  for (const c of classes.data?.classes ?? []) {
    const st = await call('GET', `/students-zone/students?classId=${c.id}`, null, null);
    const mila = (st.data?.students ?? []).find((s) => /mila/i.test(s.fullName));
    if (mila) { studentId = mila.id; break; }
  }
  if (studentId) {
    const slog = await call('POST', '/students-zone/login', { studentId });
    const sc = (slog.headers.get('set-cookie') ?? '').split(';')[0];
    studentCookie = sc;
    report('(c) login élève Mila', slog.status === 200 && Boolean(studentCookie), `studentId=${studentId}`);

    if (teacherConversationId && studentCookie) {
      const forbidden1 = await call('GET', `/ai-orchestrator/conversations/${teacherConversationId}/messages`, null, studentCookie);
      report('(c) conversation prof inaccessible par élève (404)', forbidden1.status === 404, `HTTP ${forbidden1.status}`);
    }
    // conversation élève → accès prof
    const sChat = await call('POST', '/ai-orchestrator/chat', { message: 'C’est quoi une addition ?' }, studentCookie);
    if (sChat.status === 200 && sChat.data?.conversationId) {
      const profRead = await call('GET', `/ai-orchestrator/conversations/${sChat.data.conversationId}/messages`, null, teacherCookie);
      report('(c) conversation élève inaccessible par prof (404)', profRead.status === 404, `HTTP ${profRead.status}`);

      // (d) quota : après 2 appels élève, lecture directe de ai_usage_daily
      const { execSync } = require('child_process');
      const out = execSync(
        `node -e "const db=require('better-sqlite3')('data/scolaire.db');console.log(JSON.stringify(db.prepare('SELECT day,provider,requests,tokens_in,tokens_out,errors,est_cost_usd FROM ai_usage_daily ORDER BY day DESC LIMIT 5').all()))"`,
        { cwd: require('path').resolve(__dirname, '..'), encoding: 'utf8' }
      );
      const usage = JSON.parse(out);
      const ollamaRow = usage.find((u) => u.provider === 'ollama');
      report('(d) ai_usage_daily alimenté (upsert, coût 0 pour ollama)', Boolean(ollamaRow) && Number(ollamaRow.est_cost_usd) === 0, JSON.stringify(usage));
      console.log('NOTE (d) : la limite élève (30/jour) est vérifiée côté code par comptage des messages ; vérifier le 429 nécessiterait 30 appels réels — le compteur en base est le mécanisme documenté.');
    } else {
      report('(c) chat élève', false, `HTTP ${sChat.status}`);
    }
  } else {
    report('(c) login élève Mila', false, 'élève introuvable (données de test absentes ?)');
  }

  // (e) fallback : seul ollama dispo → on le coupe → 503 propre, puis relance
  const { execSync, spawn } = require('child_process');
  let killed = false;
  try { execSync('taskkill /IM ollama.exe /F', { stdio: 'ignore' }); killed = true; } catch { /* déjà arrêté */ }
  try { execSync('taskkill /IM "ollama app.exe" /F', { stdio: 'ignore' }); } catch { /* pas d'app tray */ }
  await new Promise((r) => setTimeout(r, 1500));
  const downChat = await call('POST', '/ai-orchestrator/chat', { message: 'Donne un exercice de calcul CE2' }, teacherCookie);
  report('(e) Ollama coupé → 503 AI_NO_PROVIDER (pas de crash)', downChat.status === 503 && downChat.data?.error?.code === 'AI_NO_PROVIDER', `HTTP ${downChat.status} code=${downChat.data?.error?.code} msg=${downChat.data?.error?.message}`);
  if (killed) {
    try {
      const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', shell: true });
      child.unref();
      // attente du redémarrage
      let up = false;
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const ping = await fetch('http://127.0.0.1:11434/api/tags');
          if (ping.ok) { up = true; break; }
        } catch { /* pas encore prêt */ }
      }
      report('(e) Ollama relancé', up, up ? 'prêt' : 'à relancer manuellement (ollama serve)');
    } catch (e) {
      console.log('NOTE (e) : relance manuelle nécessaire (ollama serve).');
    }
  } else {
    console.log('NOTE (e) : Ollama était déjà arrêté avant le test.');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Échec du script de test :', e.message);
  process.exit(1);
});
