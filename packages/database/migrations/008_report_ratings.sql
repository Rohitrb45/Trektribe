BEGIN;
CREATE INDEX posts_trek_rating_idx ON posts(trek_id) INCLUDE(rating);
CREATE VIEW trail_report_ratings AS
  SELECT trek_id,round(avg(rating),1) AS rating,count(*)::integer AS reports
  FROM posts GROUP BY trek_id;
-- Reads use this view rather than legacy sample totals in treks.
INSERT INTO schema_migrations(version) VALUES(8);
COMMIT;
