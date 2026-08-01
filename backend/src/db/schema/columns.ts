// Colonnes custom Drizzle absentes de drizzle-orm 0.36 pg-core.
//
// `bytea` n'existe dans drizzle qu'à partir de versions ultérieures
// (ajout upstream post-0.36). Plutôt que de bumper drizzle en aveugle
// (risque de dérive d'API sur tout le schéma), on définit le type
// localement via customType — SQL émis : `BYTEA`, strictement
// identique aux migrations existantes (0007_deck_key_wrapped.sql).
import { customType } from 'drizzle-orm/pg-core';

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});
