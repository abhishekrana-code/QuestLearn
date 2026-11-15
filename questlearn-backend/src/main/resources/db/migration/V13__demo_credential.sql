-- The shared demo password, once an admin rotates it from the console.
--
-- The five demo accounts are seeded from DEMO_PASSWORD, or from a value generated
-- once on a fresh database. The startup seeder rewrites those rows on every start,
-- so a rotation made in the browser needs somewhere to live or the next restart
-- would put the environment value back. This single row is that override: while it
-- exists, the seeder leaves the demo rows alone.
--
-- Only the BCrypt hash is stored. The clear value exists once, in the response of
-- the rotation request, and is never written down again.

CREATE TABLE demo_credential (
    id smallint PRIMARY KEY,
    password_hash varchar(100) NOT NULL,
    rotated_at timestamp(6) with time zone NOT NULL,
    rotated_by varchar(180)
);
