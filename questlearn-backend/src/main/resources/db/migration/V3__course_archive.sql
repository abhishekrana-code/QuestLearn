-- Archiving takes a finished term out of students' way without losing its history.
--
-- The timestamp records when a course was archived (null = active). Archived
-- courses are always unpublished, so every existing student query that filters on
-- published already stops showing them.

ALTER TABLE courses ADD COLUMN archived_at timestamp(6) with time zone;
