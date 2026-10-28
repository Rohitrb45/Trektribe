BEGIN;
CREATE TABLE forum_threads (
 id uuid PRIMARY KEY, sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000), closed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE forum_replies (
 id uuid PRIMARY KEY, sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 thread_id uuid NOT NULL REFERENCES forum_threads(id), user_id uuid NOT NULL REFERENCES users(id),
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 2000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forum_replies_thread_idx ON forum_replies(thread_id,sequence);
INSERT INTO schema_migrations(version) VALUES(10);
COMMIT;
