BEGIN;
ALTER TABLE group_treks ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Kolkata';
INSERT INTO schema_migrations(version) VALUES(3);
COMMIT;
