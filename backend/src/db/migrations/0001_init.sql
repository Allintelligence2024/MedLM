-- ────────────────────────────────────────────────────────────────────────────
-- MedAnki DZ — migration initiale.
--
-- CE FICHIER NE CONTENAIT QUE DES COMMENTAIRES (bug trouvé le 2026-08-01).
--
-- Il annonçait « toutes les tables décrites dans src/db/schema/ sont créées
-- ici », mais `npm run db:generate` n'avait jamais été exécuté : le fichier
-- ne comportait pas une seule instruction SQL. Les 15 tables fondatrices
-- (users, decks, cards, review_logs, srs_card_state…) n'existaient donc dans
-- AUCUNE migration, et toute tentative de provisionner une base réelle
-- échouait dès 0002 sur « relation "review_logs" does not exist ».
--
-- Invisible jusqu'ici : aucune CI ne disposait d'un PostgreSQL, les tests
-- unitaires instancient les classes directement, et les tests d'intégration
-- substituent un faux DRIZZLE. Le premier à s'en apercevoir aurait été le
-- premier déploiement.
--
-- Contenu régénéré depuis src/db/schema/ (drizzle-kit), dans l'ordre de
-- dépendance : tables, clés étrangères, puis index.
-- ────────────────────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_fr" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"country" text NOT NULL,
	"study_year" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"name_fr" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_premium" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"name_fr" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"is_premium" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"card_count" integer DEFAULT 0 NOT NULL,
	"cover_image_key" text,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"source_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"difficulty_hint" integer,
	"is_premium" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"reviewed_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exam_question_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_versions" (
	"card_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_snapshot" jsonb NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_versions_card_id_version_pk" PRIMARY KEY("card_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"display_name" text,
	"faculty" text,
	"study_year" integer,
	"lang_pref" text DEFAULT 'fr' NOT NULL,
	"rbac_role" text DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_token" text,
	"platform" text NOT NULL,
	"app_version" text,
	"last_active" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"payment_provider" text,
	"payment_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promo_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"discount_pct" integer NOT NULL,
	"plan_duration_days" integer NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"rating" integer NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"card_type" text DEFAULT 'basic' NOT NULL,
	"exam_mode" boolean DEFAULT false NOT NULL,
	"reviewed_at" bigint NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "srs_card_state" (
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_review_at" bigint,
	"due_at" bigint,
	"is_leech" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "srs_card_state_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"deck_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"cards_due_at_start" integer DEFAULT 0 NOT NULL,
	"cards_reviewed" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_cursors" (
	"user_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"last_push_at" timestamp with time zone,
	"last_pull_at" timestamp with time zone,
	"last_pull_cursor" bigint DEFAULT 0 NOT NULL,
	"content_cursor" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "sync_cursors_user_id_device_id_pk" PRIMARY KEY("user_id","device_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modules_programme_idx" ON "modules" USING btree ("programme_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decks_module_idx" ON "decks" USING btree ("module_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decks_version_idx" ON "decks" USING btree ("version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_deck_status_idx" ON "cards" USING btree ("deck_id","status","version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_tags_idx" ON "cards" USING gin ("tags");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_content_idx" ON "cards" USING gin ("content");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_phone_idx" ON "users" USING btree ("phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_devices_user_idx" ON "user_devices" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_idx" ON "refresh_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entitlements_user_plan_idx" ON "entitlements" USING btree ("user_id","plan");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlements_expires_idx" ON "entitlements" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_reports_card_idx" ON "card_reports" USING btree ("card_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_reports_user_idx" ON "card_reports" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_logs_user_card_idx" ON "review_logs" USING btree ("user_id","card_id","reviewed_at","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_logs_user_time_idx" ON "review_logs" USING btree ("user_id","reviewed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "srs_due_idx" ON "srs_card_state" USING btree ("user_id","due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "srs_state_idx" ON "srs_card_state" USING btree ("user_id","state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_sessions_user_idx" ON "study_sessions" USING btree ("user_id","started_at");
