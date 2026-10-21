BEGIN;
ALTER TABLE group_treks ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private'));
CREATE TABLE trip_invitations (
  token_hash text PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES group_treks(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  redeemed_by uuid REFERENCES users(id),
  redeemed_at timestamptz
);
INSERT INTO schema_migrations(version) VALUES(4);
COMMIT;
