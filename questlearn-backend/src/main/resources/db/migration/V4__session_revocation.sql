-- Session revocation.
--
-- Every token carries the user's token_version at the moment it was issued. The
-- JWT filter compares that claim with this column, so bumping the column (on a
-- password change or an admin-issued reset) invalidates every token issued
-- earlier, without a deny-list table and without waiting for expiry.
--
-- Existing accounts start at 0, which matches the claim already present in the
-- tokens they hold, so deploying this migration does not sign anybody out.

ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 0;
