-- Migration 0017 — device_tokens (audit P1-3)
--
-- Il manquait la moitié de la chaîne de notifications : le backend
-- savait ENVOYER un push (NotificationsService + FcmProvider) mais
-- rien ne stockait vers QUI l'envoyer. Le mobile n'avait ni package
-- FCM, ni remontée de token — la fonctionnalité était donc morte de
-- bout en bout.
--
-- Un utilisateur peut avoir plusieurs appareils ; un appareil ne porte
-- qu'un seul token actif à la fois. La contrainte d'unicité est sur
-- (user_id, device_id) : la ré-émission d'un token par FCM (rotation
-- normale, réinstallation) est un UPDATE, pas une ligne de plus.
--
-- Le token lui-même n'est pas un secret d'authentification : c'est une
-- adresse d'acheminement. Il reste néanmoins une donnée personnelle
-- (identifiant d'appareil) — supprimée en cascade avec le compte.

CREATE TABLE IF NOT EXISTS device_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL,
  token         TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  app_version   TEXT,
  locale        TEXT,
  -- Désactivation sans suppression : FCM répond 404/410 « UNREGISTERED »
  -- quand l'app est désinstallée. On marque plutôt que d'effacer, pour
  -- ne pas retenter indéfiniment et pour garder la trace.
  disabled_at   TIMESTAMPTZ,
  disabled_reason TEXT,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un seul enregistrement par (utilisateur, appareil).
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_user_device_key
  ON device_tokens (user_id, device_id);

-- Le même token ne doit pas servir deux comptes (partage d'appareil :
-- le dernier connecté gagne, l'ancien est nettoyé applicativement).
CREATE INDEX IF NOT EXISTS device_tokens_token_idx
  ON device_tokens (token);

-- Ciblage des envois : « tous les appareils actifs de cet utilisateur ».
CREATE INDEX IF NOT EXISTS device_tokens_user_active_idx
  ON device_tokens (user_id, disabled_at);
