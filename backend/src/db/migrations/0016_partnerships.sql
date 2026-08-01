-- Migration 0016 — partnerships (Phase 20.4, partenariats facultés)
--
-- Une faculté partenaire = du contenu co-produit (source.type
-- 'partnership' côté cartes) avec contrepartie (redevance en DZD).
-- Invariants :
--   * statut borné par CHECK (draft/active/suspended/terminated) ;
--   * commission 0..50 % (bornée — le produit doit rester viable) ;
--   * UN SEUL partenariat ACTIVE par faculté (index partiel UNIQUE).

CREATE TABLE IF NOT EXISTS partnerships (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty        TEXT NOT NULL,
  contact_email  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'active', 'suspended', 'terminated')),
  -- Périmètre : modules/decks couverts par l'accord (slugs).
  scope          TEXT[] NOT NULL DEFAULT '{}',
  commission_pct INTEGER NOT NULL DEFAULT 0
                 CHECK (commission_pct >= 0 AND commission_pct <= 50),
  signed_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partnerships_status_idx
  ON partnerships (status);

-- Un seul partenariat actif par faculté (cohérence redevance/contenu).
CREATE UNIQUE INDEX IF NOT EXISTS partnerships_active_faculty_idx
  ON partnerships (faculty) WHERE status = 'active';
