-- Course gating.
--
-- Off by default so every existing course keeps behaving exactly as before.
-- When on, a course is only listed to learners already enrolled in it, and its
-- detail pages refuse everyone else. Joining stays possible through a class
-- code, which is the point of the flag: the code is the invitation.

ALTER TABLE courses
    ADD COLUMN membership_required boolean NOT NULL DEFAULT false;
