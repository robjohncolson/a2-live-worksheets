import { createServiceClient } from './ledger-db.js';
import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';
import { createRateLimiter } from './rate-limit.js';

export function announcementMonday(now, schoolTz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: schoolTz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export function validateAnnouncement(body) {
  const weekOf = body?.weekOf;
  const date = typeof weekOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekOf)
    ? new Date(weekOf + 'T00:00:00Z') : new Date(NaN);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== weekOf || date.getUTCDay() !== 1) {
    throw new Error('weekOf must be a valid Monday (YYYY-MM-DD)');
  }
  if (typeof body?.text !== 'string') throw new Error('text must be a string');
  const text = body.text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (text.length > 280) throw new Error('text must be at most 280 characters');
  // Check both the original and plain text so tags cannot hide private details.
  for (const value of [text, body.text]) {
    if (/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/i.test(value)) throw new Error('Email addresses are not allowed');
    if (/(?:\d[\s().+\-]*){6}\d/.test(value)) throw new Error('Phone numbers are not allowed');
    if (/(?:[a-z][a-z0-9+.-]*:\/\/|www\.|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\b|\/))/i.test(value)) throw new Error('URLs are not allowed');
  }
  return { text, weekOf };
}

export function createAnnouncementStore(client = createServiceClient()) {
  return {
    async get(weekOf) {
      const { data, error } = await client.from('announcements').select('text, week_of, updated_at').eq('week_of', weekOf).maybeSingle();
      if (error) throw error;
      return data ? { text: data.text, weekOf: data.week_of, updatedAt: data.updated_at } : { text: null };
    },
    async put({ text, weekOf, updatedAt, updatedBy }) {
      const query = client.from('announcements');
      const { error } = text
        ? await query.upsert({ week_of: weekOf, text, updated_at: updatedAt, updated_by: updatedBy })
        : await query.delete().eq('week_of', weekOf);
      if (error) throw error;
    },
  };
}

export function mountAnnouncements(app, { db, config, store, now = () => new Date() }) {
  let liveStore = store;
  const storage = () => liveStore ||= createAnnouncementStore();
  const allow = createRateLimiter({ windowMs: 60000, max: 30 });
  app.get('/announcement', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await storage().get(announcementMonday(now(), config.schoolTz))); }
    catch { res.status(503).json({ error: 'Announcement service unavailable' }); }
  });
  app.put('/teacher/announcement', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!await requireTeacher(req, db)) return res.status(403).json({ error: 'Teacher sign-in required' });
    if (!allow(req.ip)) return res.status(429).json({ error: 'Too many announcement writes; try again in a minute' });
    let announcement;
    try { announcement = validateAnnouncement(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.query.token;
    const updatedBy = typeof token === 'string' ? verifyToken(token) : null;
    const updatedAt = now().toISOString();
    try {
      await storage().put({ ...announcement, updatedAt, updatedBy });
      res.json(announcement.text ? { ...announcement, updatedAt } : { text: null });
    } catch { res.status(503).json({ error: 'Announcement service unavailable' }); }
  });
}
