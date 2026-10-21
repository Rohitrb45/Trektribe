BEGIN;
ALTER TABLE group_trek_members ADD COLUMN role text NOT NULL DEFAULT 'member'
  CHECK(role IN ('member','cohost'));
ALTER TABLE group_trek_members ADD CONSTRAINT cohost_accepted CHECK(role<>'cohost' OR status='accepted');
INSERT INTO schema_migrations(version) VALUES(9);
COMMIT;
