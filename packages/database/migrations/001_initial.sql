BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
  id uuid PRIMARY KEY, username text NOT NULL UNIQUE, name text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE treks (
  id uuid PRIMARY KEY, title text NOT NULL, region text NOT NULL, description text NOT NULL,
  difficulty text NOT NULL CHECK(difficulty IN ('Easy','Moderate','Hard')),
  distance_km numeric NOT NULL CHECK(distance_km>0), elevation_m integer NOT NULL CHECK(elevation_m>=0),
  duration text NOT NULL, altitude_m integer NOT NULL, rating numeric NOT NULL CHECK(rating BETWEEN 0 AND 5),
  report_count integer NOT NULL DEFAULT 0, color text NOT NULL, highlights jsonb NOT NULL,
  trailhead_location geography(Point,4326) NOT NULL,
  route_geometry geometry(LineString,4326) NOT NULL
);
CREATE INDEX treks_trailhead_gix ON treks USING gist(trailhead_location);
CREATE INDEX treks_route_gix ON treks USING gist(route_geometry);
CREATE TABLE posts (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), trek_id uuid NOT NULL REFERENCES treks(id),
  content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 5000),
  rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
  condition text NOT NULL CHECK(condition IN ('Clear','Muddy','Snow','Blocked','Unknown')),
  observed_at date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_feed_idx ON posts(created_at DESC,id DESC);
CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY(post_id,user_id)
);
CREATE TABLE comments (
  id uuid PRIMARY KEY, post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id), body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON comments(post_id,created_at,id);
CREATE TABLE saved_treks (
  user_id uuid NOT NULL REFERENCES users(id), trek_id uuid NOT NULL REFERENCES treks(id),
  PRIMARY KEY(user_id,trek_id)
);
CREATE TABLE group_treks (
  id uuid PRIMARY KEY, trek_id uuid NOT NULL REFERENCES treks(id), title text NOT NULL,
  organizer_id uuid NOT NULL REFERENCES users(id), starts_at timestamptz NOT NULL,
  max_participants integer NOT NULL CHECK(max_participants>0),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed'))
);
CREATE TABLE group_trek_members (
  trip_id uuid NOT NULL REFERENCES group_treks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL CHECK(status IN ('pending','accepted')),
  PRIMARY KEY(trip_id,user_id)
);
CREATE INDEX group_trek_members_user_idx ON group_trek_members(user_id,status);
INSERT INTO schema_migrations(version) VALUES(1);
COMMIT;
