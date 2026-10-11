BEGIN;
CREATE TABLE user_identities (
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (issuer, subject),
  UNIQUE (user_id)
);
INSERT INTO schema_migrations(version) VALUES(2);
COMMIT;
