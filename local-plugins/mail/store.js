/** Account-local POP3 discovery, reminder and header index. */
import { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 1

/** Open a private mail index at a path owned by one configured account. */
export function openMailbox(path) {
  const db = new DatabaseSync(path)
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version
    if (version !== 0 && version !== SCHEMA_VERSION) throw new Error('Unsupported mail index version.')
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS baseline (id INTEGER PRIMARY KEY CHECK (id = 1));
      CREATE TABLE IF NOT EXISTS mail (
        uid TEXT PRIMARY KEY, present INTEGER NOT NULL, pending INTEGER NOT NULL,
        subject TEXT, sender TEXT, date TEXT, indexed INTEGER NOT NULL DEFAULT 0
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
    `)
  } catch (error) {
    db.close()
    throw error
  }
  const hasBaseline = db.prepare('SELECT id FROM baseline WHERE id = 1')
  const baseline = db.prepare('INSERT OR IGNORE INTO baseline VALUES (1)')
  const upsert = db.prepare(`
    INSERT INTO mail (uid, present, pending) VALUES (?, 1, ?)
    ON CONFLICT (uid) DO UPDATE SET present = 1
  `)
  const lookup = db.prepare('SELECT indexed FROM mail WHERE uid = ?')
  const index = db.prepare('UPDATE mail SET subject = ?, sender = ?, date = ?, indexed = 1 WHERE uid = ?')
  const pending = db.prepare('SELECT max(rowid) AS through, count(*) AS count FROM mail WHERE pending = 1')
  const clear = db.prepare('UPDATE mail SET pending = 0 WHERE pending = 1 AND rowid <= ?')
  return {
    close: () => db.close(),
    discover(identifiers) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const initialized = !!hasBaseline.get()
        db.exec('UPDATE mail SET present = 0 WHERE present = 1')
        for (const uid of identifiers.values()) upsert.run(uid, initialized ? 1 : 0)
        baseline.run()
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    needsIndex: uid => lookup.get(uid)?.indexed === 0,
    index(uid, header) {
      index.run(header.subject, header.from, header.date, uid)
    },
    pending: () => pending.get(),
    clearThrough: id => clear.run(id),
    search({ query, from, since }) {
      return db.prepare(`
        SELECT uid AS id, subject, sender AS "from", date, present AS available
        FROM mail WHERE indexed = 1 AND subject IS NOT NULL
          AND (? = '' OR instr(lower(subject || ' ' || sender), lower(?)) > 0)
          AND (? = '' OR instr(lower(sender), lower(?)) > 0)
          AND (? = '' OR date >= ?)
        ORDER BY date DESC, rowid DESC LIMIT 21
      `).all(query, query, from, from, since, since)
    },
    coverage() {
      const row = db.prepare(`
        SELECT min(date) AS earliest, max(date) AS latest,
          count(CASE WHEN present = 1 AND (indexed = 0 OR subject IS NULL) THEN 1 END) AS unindexed
        FROM mail
      `).get()
      return row
    },
  }
}
