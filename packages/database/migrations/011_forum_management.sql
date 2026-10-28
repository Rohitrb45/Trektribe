BEGIN;
ALTER TABLE forum_threads ADD COLUMN revision integer NOT NULL DEFAULT 1, ADD COLUMN deleted_at timestamptz;
ALTER TABLE forum_replies ADD COLUMN revision integer NOT NULL DEFAULT 1, ADD COLUMN deleted_at timestamptz;
CREATE TABLE forum_moderators(user_id uuid PRIMARY KEY REFERENCES users(id));
CREATE TABLE forum_reports (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 reporter_id uuid NOT NULL REFERENCES users(id), thread_id uuid NOT NULL REFERENCES forum_threads(id),
 reply_id uuid REFERENCES forum_replies(id), reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 1000),
 snapshot_title text NOT NULL, snapshot_body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX forum_reports_open_target_idx ON forum_reports(reporter_id,thread_id,reply_id) NULLS NOT DISTINCT WHERE resolved_at IS NULL;
CREATE TABLE forum_moderation_actions (
 report_id bigint PRIMARY KEY REFERENCES forum_reports(id), moderator_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('dismiss','remove')), reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forum_reports_pending_idx ON forum_reports(id) WHERE resolved_at IS NULL;
INSERT INTO schema_migrations(version) VALUES(11);
COMMIT;
