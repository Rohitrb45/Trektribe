BEGIN;
ALTER TABLE treks ADD COLUMN owner_id uuid REFERENCES users(id);
CREATE TABLE route_versions (
  id uuid PRIMARY KEY,
  trek_id uuid NOT NULL REFERENCES treks(id),
  geometry geometry(LineString,4326) NOT NULL,
  distance_km double precision NOT NULL CHECK(distance_km>0),
  elevation_m integer NOT NULL CHECK(elevation_m>=0),
  altitude_m integer NOT NULL,
  has_elevation boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trek_id,id)
);
INSERT INTO route_versions(id,trek_id,geometry,distance_km,elevation_m,altitude_m)
SELECT gen_random_uuid(),id,route_geometry,distance_km,elevation_m,altitude_m FROM treks;
ALTER TABLE treks ADD COLUMN current_route_version_id uuid;
UPDATE treks t SET current_route_version_id=r.id FROM route_versions r WHERE r.trek_id=t.id;
ALTER TABLE treks ADD FOREIGN KEY(id,current_route_version_id) REFERENCES route_versions(trek_id,id);
ALTER TABLE group_treks ADD COLUMN route_version_id uuid;
UPDATE group_treks g SET route_version_id=t.current_route_version_id FROM treks t WHERE t.id=g.trek_id;
ALTER TABLE group_treks ALTER COLUMN route_version_id SET NOT NULL;
ALTER TABLE group_treks ADD FOREIGN KEY(trek_id,route_version_id) REFERENCES route_versions(trek_id,id);
CREATE FUNCTION immutable_route_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published route versions are immutable'; END;
$$;
CREATE TRIGGER route_version_immutable BEFORE UPDATE OR DELETE ON route_versions FOR EACH ROW EXECUTE FUNCTION immutable_route_version();
INSERT INTO schema_migrations(version) VALUES(5);
COMMIT;
