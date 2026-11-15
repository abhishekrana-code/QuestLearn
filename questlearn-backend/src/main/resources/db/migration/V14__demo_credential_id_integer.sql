-- The single-row demo credential table was created with a smallint key, while the
-- entity declares an Integer, and the schema is validated at startup rather than
-- generated. Widening the column is enough; no data can be lost in a table that
-- holds at most one row.

ALTER TABLE demo_credential ALTER COLUMN id TYPE integer;
