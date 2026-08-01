// Garde-fou migrations (audit 2026-08-01, P1-1).
//
// Deux bugs corrigés ici, verrouillés pour de bon :
//   1. `meta/_journal.json` n'existait pas — or drizzle `migrate()` lit
//      EXCLUSIVEMENT ce fichier (readMigrationFiles jette « Can't find
//      meta/_journal.json » sinon). `npm run db:migrate` était donc
//      cassé à 100 % : aucune base n'avait jamais pu être provisionnée
//      par le chemin officiel.
//   2. la série sautait 0011 (0010 → 0012). Renumérotée 0011–0016
//      avant toute application en prod.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'src', 'db', 'migrations');

function sqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

type Journal = {
  version: string;
  dialect: string;
  entries: { idx: number; tag: string; when: number; breakpoints: boolean }[];
};

function journal(): Journal {
  return JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;
}

describe('migrations — séquence', () => {
  it('numérotation strictement séquentielle depuis 0001 (aucun trou)', () => {
    const nums = sqlFiles().map((f) => Number(f.slice(0, 4)));
    expect(nums.length).toBeGreaterThan(0);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it('aucun préfixe numérique dupliqué', () => {
    const prefixes = sqlFiles().map((f) => f.slice(0, 4));
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('migrations — meta/_journal.json', () => {
  it('existe et déclare le dialecte postgresql', () => {
    const j = journal();
    expect(j.dialect).toBe('postgresql');
    expect(Array.isArray(j.entries)).toBe(true);
  });

  it('une entrée par fichier .sql, dans le même ordre', () => {
    const tags = sqlFiles().map((f) => f.replace(/\.sql$/, ''));
    expect(journal().entries.map((e) => e.tag)).toEqual(tags);
  });

  it('idx contigus et horodatages strictement croissants', () => {
    const entries = journal().entries;
    entries.forEach((e, i) => expect(e.idx).toBe(i));
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i]!.when).toBeGreaterThan(entries[i - 1]!.when);
    }
  });

  it('chaque tag du journal pointe vers un fichier lisible et non vide', () => {
    for (const e of journal().entries) {
      const body = readFileSync(join(MIGRATIONS_DIR, `${e.tag}.sql`), 'utf8');
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });
});
