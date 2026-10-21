BEGIN;
CREATE TABLE trip_messages (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES group_treks(id),
  sequence bigint NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trip_id,sequence)
);
CREATE TABLE trip_outbox (
  id bigserial PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES group_treks(id),
  message_id uuid NOT NULL UNIQUE REFERENCES trip_messages(id),
  delivered_at timestamptz
);
CREATE INDEX trip_outbox_pending ON trip_outbox(id) WHERE delivered_at IS NULL;
INSERT INTO schema_migrations(version) VALUES(6);
COMMIT;
