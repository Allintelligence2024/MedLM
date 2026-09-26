-- Align PostgreSQL card lifecycle with the CMS editorial workflow.
ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_status_check;
ALTER TABLE cards
  ADD CONSTRAINT cards_status_check
  CHECK (status IN ('draft', 'review', 'approved', 'published', 'retired'));
