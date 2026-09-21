// Practice state is private to the roster identity and is never grade evidence.
import { verifyToken } from './token.js';
import { createServiceClient } from './ledger-db.js';
import { mountFlashcardDaily } from './flashcard-daily.js';

export const FLASHCARD_STATE_MAX_BYTES = 262144;

export function createFlashcardStateStore(client) {
  return {
    async get(studentId) {
      const { data, error } = await client.from('flashcard_state')
        .select('state, updated_at').eq('student_id', studentId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async put(studentId, state, baseUpdatedAt) {
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(baseUpdatedAt || '') + 1 || 0)).toISOString();
      const row = { student_id: studentId, state, updated_at: updatedAt };
      // Both branches compare atomically in Postgres. An unconditional upsert
      // would let two devices silently overwrite each other's practice logs.
      const query = baseUpdatedAt === null
        ? client.from('flashcard_state').insert(row)
        : client.from('flashcard_state').update(row)
          .eq('student_id', studentId).eq('updated_at', baseUpdatedAt);
      const { data, error } = await query.select('state, updated_at').maybeSingle();
      if (error?.code === '23505') return null;
      if (error) throw error;
      return data;
    },
  };
}

export function mountFlashcardState(app, { db, store }) {
  let liveStore = store;
  const getStore = () => {
    if (!liveStore) liveStore = createFlashcardStateStore(createServiceClient());
    return liveStore;
  };

  async function studentIdentity(req, res, next) {
    const bearer = req.get('authorization');
    const token = bearer?.replace(/^Bearer\s+/i, '') || req.query.token || req.body?.token;
    const studentId = typeof token === 'string' ? verifyToken(token) : null;
    if (!studentId) return res.status(401).json({ ok: false, error: 'forbidden' });
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) throw error;
      if (!data) return res.status(401).json({ ok: false, error: 'forbidden' });
      if (req.method === 'POST' && data.status === 'archived') return res.status(401).json({ ok: false, error: 'forbidden' });
      if (req.method === 'POST' && data.must_change_password) return res.status(403).json({ ok: false, error: 'password change required' });
      req.flashcardStudentId = studentId;
      next();
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'flashcard state unavailable' });
    }
  }

  app.get('/flashcards/state', studentIdentity, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const row = await getStore().get(req.flashcardStudentId);
      if (!row) return res.json({ ok: true, found: false });
      return res.json({ ok: true, found: true, state: row.state, updatedAt: row.updated_at });
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'flashcard state unavailable' });
    }
  });

  app.put('/flashcards/state', studentIdentity, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { state, baseUpdatedAt } = req.body || {};
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return res.status(400).json({ ok: false, error: 'state must be a JSON object' });
    }
    if (baseUpdatedAt !== null && (typeof baseUpdatedAt !== 'string' || !Number.isFinite(Date.parse(baseUpdatedAt)))) {
      return res.status(400).json({ ok: false, error: 'baseUpdatedAt must be null or a timestamp' });
    }
    if (Buffer.byteLength(JSON.stringify(state), 'utf8') > FLASHCARD_STATE_MAX_BYTES) {
      return res.status(413).json({ ok: false, error: 'state too large' });
    }
    try {
      const old = await getStore().get(req.flashcardStudentId);
      if ((old?.updated_at || null) !== baseUpdatedAt) return res.status(409).json({ ok: false, error: 'stale' });
      const preserved = { ...state };
      delete preserved.dailyRuns;
      if (old?.state?.dailyRuns) preserved.dailyRuns = old.state.dailyRuns;
      if (Buffer.byteLength(JSON.stringify(preserved), 'utf8') > FLASHCARD_STATE_MAX_BYTES) {
        return res.status(413).json({ ok: false, error: 'state too large' });
      }
      const row = await getStore().put(req.flashcardStudentId, preserved, baseUpdatedAt);
      if (!row) return res.status(409).json({ ok: false, error: 'stale' });
      return res.json({ ok: true, updatedAt: row.updated_at });
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'flashcard state unavailable' });
    }
  });
  mountFlashcardDaily(app, { db, getStore, studentIdentity, maxStateBytes: FLASHCARD_STATE_MAX_BYTES });
}
