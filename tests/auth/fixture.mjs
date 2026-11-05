import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of ['0001_auth.sql', '0002_security.sql']) sqlite.exec(readFileSync(new URL(`../../migrations/auth/${file}`, import.meta.url), 'utf8'));
  const wrapper = {
    sqlite,
    prepare(sql) {
      let args = [];
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) { args = values; return this; },
        async first(column) { const row = statement.get(...args); return column ? row?.[column] ?? null : row ?? null; },
        async all() { const results = statement.all(...args); return { success: true, results, meta: { changes: sqlite.prepare('SELECT changes() c').get().c } }; },
        async run() { const result = statement.run(...args); return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.all())); },
    async exec(sql) { sqlite.exec(sql); return {}; }
  };
  return wrapper;
}
