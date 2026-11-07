BEGIN;
CREATE TABLE private_tracks (
 owner_id uuid NOT NULL REFERENCES users(id), id uuid NOT NULL,
 title text NOT NULL, chunk_count integer NOT NULL CHECK(chunk_count BETWEEN 1 AND 500),
 expected_points integer NOT NULL CHECK(expected_points BETWEEN 1 AND 100000),
 next_chunk integer NOT NULL DEFAULT 0, point_count integer NOT NULL DEFAULT 0,
 last_timestamp bigint, completed boolean NOT NULL DEFAULT false, deleted_at timestamptz,
 PRIMARY KEY(owner_id,id),
 CHECK(next_chunk BETWEEN 0 AND chunk_count), CHECK(point_count BETWEEN 0 AND expected_points)
);
CREATE TABLE private_track_chunks (
 owner_id uuid NOT NULL, track_id uuid NOT NULL, sequence integer NOT NULL CHECK(sequence BETWEEN 0 AND 499),
 checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'), payload text NOT NULL,
 PRIMARY KEY(owner_id,track_id,sequence),
 FOREIGN KEY(owner_id,track_id) REFERENCES private_tracks(owner_id,id) ON DELETE CASCADE
);
INSERT INTO schema_migrations(version) VALUES(12);
COMMIT;
