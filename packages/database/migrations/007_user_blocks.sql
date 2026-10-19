BEGIN;
CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id),
  blocked_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(blocker_id,blocked_id),
  CHECK(blocker_id<>blocked_id)
);
CREATE INDEX user_blocks_target_idx ON user_blocks(blocked_id,blocker_id);
CREATE FUNCTION users_blocked(a uuid,b uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_id=a AND blocked_id=b) OR (blocker_id=b AND blocked_id=a));
$$;
INSERT INTO schema_migrations(version) VALUES(7);
COMMIT;
