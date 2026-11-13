package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.CourseDto;
import com.questlearn.dto.CourseRequest;
import com.questlearn.dto.AttemptDto;
import com.questlearn.dto.CourseNodeRef;
import com.questlearn.dto.CourseRosterDto;
import com.questlearn.dto.CourseUpdateRequest;
import com.questlearn.dto.LearnerNodeDto;
import com.questlearn.dto.RosterLearnerDetailDto;
import com.questlearn.dto.RosterLearnerDto;
import com.questlearn.dto.RosterNodeDto;
import com.questlearn.dto.RosterImportResult;
import com.questlearn.dto.ModuleRequest;
import com.questlearn.dto.ModuleUpdateRequest;
import com.questlearn.dto.QuizRequest;
import com.questlearn.exception.ApiException;
import com.questlearn.model.CohortMembership;
import com.questlearn.model.Course;
import com.questlearn.model.Enrollment;
import com.questlearn.model.Module;
import com.questlearn.model.ModuleAttempt;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Quiz;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.EnrollmentRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.QuizRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CourseService {

    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final QuizRepository quizRepository;
    private final UserRepository userRepository;
    private final UserModuleProgressRepository progressRepository;
    private final ModuleAttemptRepository attemptRepository;
    private final QuizService quizService;
    private final MediaStorageService mediaStorageService;
    private final AuditService auditService;
    private final EnrollmentRepository enrollmentRepository;

    /** Big enough for any real class list, small enough to stay one quick request. */
    private static final int MAX_ROSTER_IMPORT = 500;
    private final com.questlearn.repository.CohortRepository cohortRepository;
    private final com.questlearn.repository.CohortMembershipRepository cohortMembershipRepository;

    @Transactional(readOnly = true)
    public List<CourseDto> listCourses(AppUserPrincipal principal) {
        Map<Long, Course> visible = new LinkedHashMap<>();
        if (principal.role() == Role.ADMIN) {
            courseRepository.findAllByOrderByIdAsc().forEach(c -> visible.put(c.getId(), c));
        } else if (principal.role() == Role.INSTRUCTOR) {
            courseRepository.findByPublishedTrueOrderByIdAsc().forEach(c -> visible.put(c.getId(), c));
            courseRepository.findByInstructorIdOrderByIdAsc(principal.id())
                    .forEach(c -> visible.put(c.getId(), c));
        } else {
            Set<Long> mine = enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(principal.id()).stream()
                    .map(Enrollment::getCourseId)
                    .collect(Collectors.toSet());
            courseRepository.findByPublishedTrueOrderByIdAsc().stream()
                    // A gated course is invisible until its class code lets them in.
                    .filter(c -> !c.isMembershipRequired() || mine.contains(c.getId()))
                    .forEach(c -> visible.put(c.getId(), c));
        }

        List<Course> ordered = visible.values().stream()
                .sorted(Comparator.comparing(Course::getId))
                .toList();
        return withEnrollmentContext(ordered, principal);
    }

    /**
     * The learner's own courses: the ones they joined, still live.
     *
     * <p>Instructors and admins get their normal list; enrollment is a student
     * concept, so pretending otherwise would only produce an empty page.</p>
     */
    @Transactional(readOnly = true)
    public List<CourseDto> listMyCourses(AppUserPrincipal principal) {
        if (principal.role() != Role.STUDENT) {
            return listCourses(principal);
        }
        Set<Long> enrolledIds = enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(principal.id())
                .stream()
                .map(Enrollment::getCourseId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (enrolledIds.isEmpty()) {
            return List.of();
        }
        List<Course> courses = courseRepository.findAllById(enrolledIds).stream()
                .filter(Course::isPublished)
                .filter(course -> course.getArchivedAt() == null)
                .sorted(Comparator.comparing(Course::getId))
                .toList();
        return withEnrollmentContext(courses, principal);
    }

    /**
     * Joining is idempotent: clicking twice, or in two tabs, is not an error and
     * does not duplicate a roster entry.
     */
    @Transactional
    public CourseDto enroll(Long courseId, AppUserPrincipal principal) {
        if (principal.role() != Role.STUDENT) {
            throw ApiException.forbidden("Only students join courses");
        }
        Course course = loadCourse(courseId);
        assertCanView(course, principal);
        if (!enrollmentRepository.existsByUserIdAndCourseId(principal.id(), courseId)) {
            enrollmentRepository.save(Enrollment.builder()
                    .userId(principal.id())
                    .courseId(courseId)
                    .build());
        }
        return toCourseDto(course, principal);
    }

    /**
     * Leaving removes the roster entry only. Progress is the learner's work and is
     * kept, so re-joining later resumes where they stopped.
     */
    @Transactional
    public void unenroll(Long courseId, AppUserPrincipal principal) {
        if (principal.role() != Role.STUDENT) {
            throw ApiException.forbidden("Only students join courses");
        }
        enrollmentRepository.deleteByUserIdAndCourseId(principal.id(), courseId);
    }

    /**
     * Who joined a course and how far each of them got.
     *
     * <p>Only the course's own instructor or an admin may read it: the roster is
     * other people's work, not something a student can ask for.</p>
     */
    /**
     * Gating toggle. A members-only course leaves the catalogue and stops accepting
     * plain joins; a class code is the way in.
     */
    @Transactional
    public CourseDto setMembershipRequired(Long courseId, boolean membersOnly, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);
        course.setMembershipRequired(membersOnly);
        return toCourseDto(courseRepository.save(course), principal);
    }

    /**
     * @param cohortId    when set, the roster narrows to that class; without it the
     *                    roster answers "who is in this course at all"
     * @param nodeId      when set with {@code nodeCleared}, the roster answers "who has
     *                    cleared, or not cleared, this one node"
     * @param nodeCleared false keeps the learners still stuck on that node
     */
    @Transactional(readOnly = true)
    public CourseRosterDto roster(Long courseId, Long cohortId, Long nodeId, Boolean nodeCleared,
                                  AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        List<Module> modules = moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        List<Enrollment> enrollments = enrollmentRepository.findByCourseIdOrderByEnrolledAtAsc(courseId);

        if (cohortId != null) {
            var cohort = cohortRepository.findById(cohortId)
                    .orElseThrow(() -> ApiException.notFound("Class not found"));
            if (!cohort.getCourseId().equals(courseId)) {
                throw ApiException.notFound("That class is not part of this course");
            }
            Set<Long> members = cohortMembershipRepository.findByCohortIdOrderByJoinedAtAsc(cohortId)
                    .stream()
                    .map(membership -> membership.getUserId())
                    .collect(Collectors.toSet());
            enrollments = enrollments.stream()
                    .filter(enrollment -> members.contains(enrollment.getUserId()))
                    .toList();
        }

        List<CourseNodeRef> nodeRefs = modules.stream()
                .map(module -> new CourseNodeRef(module.getId(), module.getTitle()))
                .toList();

        if (enrollments.isEmpty()) {
            return new CourseRosterDto(course.getId(), course.getTitle(), modules.size(), nodeRefs, List.of());
        }

        List<Long> learnerIds = enrollments.stream().map(Enrollment::getUserId).toList();
        Map<Long, User> learners = userRepository.findAllById(learnerIds).stream()
                .collect(Collectors.toMap(User::getId, user -> user));

        Map<Long, Map<Long, UserModuleProgress>> progressByLearner = new HashMap<>();
        if (!modules.isEmpty()) {
            for (UserModuleProgress row : progressRepository.findByModuleCourseIdAndUserIdIn(courseId, learnerIds)) {
                progressByLearner
                        .computeIfAbsent(row.getUser().getId(), key -> new HashMap<>())
                        .put(row.getModule().getId(), row);
            }
        }

        List<RosterLearnerDto> roster = new ArrayList<>();
        for (Enrollment enrollment : enrollments) {
            User learner = learners.get(enrollment.getUserId());
            if (learner == null) {
                continue;
            }
            Map<Long, UserModuleProgress> progress = progressByLearner.getOrDefault(learner.getId(), Map.of());
            List<RosterNodeDto> nodes = new ArrayList<>(modules.size());
            Instant lastActivity = enrollment.getEnrolledAt();
            long cleared = 0;
            for (Module module : modules) {
                UserModuleProgress row = progress.get(module.getId());
                if (row != null && row.getStatus() == ProgressStatus.COMPLETED) {
                    cleared++;
                    if (row.getCompletedAt() != null && row.getCompletedAt().isAfter(lastActivity)) {
                        lastActivity = row.getCompletedAt();
                    }
                }
                nodes.add(new RosterNodeDto(
                        module.getId(),
                        module.getTitle(),
                        row == null ? ProgressStatus.LOCKED.name() : row.getStatus().name(),
                        row == null ? 0 : row.getScore(),
                        row == null ? 0 : row.getAttempts(),
                        row == null ? null : row.getCompletedAt()));
            }
            roster.add(new RosterLearnerDto(
                    learner.getId(),
                    learner.getName(),
                    learner.getEmail(),
                    learner.getTotalXp(),
                    learner.getCurrentLevel(),
                    learner.getStreakDays(),
                    cleared,
                    modules.size(),
                    enrollment.getEnrolledAt(),
                    lastActivity,
                    nodes));
        }

        if (nodeId != null) {
            boolean nodeExists = modules.stream().anyMatch(module -> module.getId().equals(nodeId));
            if (!nodeExists) {
                throw ApiException.notFound("That node is not part of this course");
            }
            boolean wantCleared = nodeCleared == null || nodeCleared;
            roster = roster.stream()
                    .filter(learner -> learner.nodes().stream()
                            .filter(node -> node.moduleId().equals(nodeId))
                            .anyMatch(node -> "COMPLETED".equals(node.status()) == wantCleared))
                    .toList();
        }
        return new CourseRosterDto(course.getId(), course.getTitle(), modules.size(), nodeRefs, roster);
    }

    /**
     * Adds a pasted class list to the course, and optionally to one of its classes.
     *
     * <p>It reuses the enrollment path rather than writing roster rows directly, so an
     * imported student is in exactly the state a code would have left them in. An
     * address with no student account is reported instead of created: there is no way
     * to deliver a password yet, and inventing accounts for typos is worse than a
     * visible leftover.</p>
     */
    @Transactional
    public RosterImportResult importRoster(Long courseId, List<String> emails, Long cohortId,
                                           AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        if (cohortId != null) {
            var cohort = cohortRepository.findById(cohortId)
                    .orElseThrow(() -> ApiException.notFound("Class not found"));
            if (!cohort.getCourseId().equals(courseId)) {
                throw ApiException.notFound("That class is not part of this course");
            }
        }

        List<String> imported = new ArrayList<>();
        List<String> alreadyMember = new ArrayList<>();
        List<String> unknown = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();

        if (emails == null || emails.isEmpty()) {
            throw ApiException.badRequest("That list had no email addresses in it");
        }
        // A pasted spreadsheet is fine; a 10,000-row file belongs in a script, not in
        // one request that holds a transaction open for every lookup.
        if (emails.size() > MAX_ROSTER_IMPORT) {
            throw ApiException.badRequest("Import at most " + MAX_ROSTER_IMPORT + " addresses at a time");
        }

        for (String raw : emails) {
            if (raw == null) {
                continue;
            }
            String email = raw.trim().toLowerCase(Locale.ROOT);
            if (email.isEmpty() || !seen.add(email)) {
                continue;
            }

            var student = userRepository.findByEmailIgnoreCase(email).orElse(null);
            if (student == null || student.getRole() != Role.STUDENT) {
                unknown.add(email);
                continue;
            }

            boolean enrolled = enrollmentRepository.existsByUserIdAndCourseId(student.getId(), courseId);
            if (!enrolled) {
                enrollmentRepository.save(Enrollment.builder()
                        .userId(student.getId())
                        .courseId(courseId)
                        .build());
            }
            if (cohortId != null
                    && !cohortMembershipRepository.existsByCohortIdAndUserId(cohortId, student.getId())) {
                cohortMembershipRepository.save(CohortMembership.builder()
                        .cohortId(cohortId)
                        .userId(student.getId())
                        .build());
            }
            (enrolled ? alreadyMember : imported).add(email);
        }

        // A list of blanks passes the size check and then matches nothing: say so
        // rather than report a successful import of zero.
        if (seen.isEmpty()) {
            throw ApiException.badRequest("No email addresses found in that list");
        }

        auditService.record(principal, "course.roster_imported", course.getTitle(),
                imported.size() + " added, " + alreadyMember.size() + " already enrolled, "
                        + unknown.size() + " unknown");
        return new RosterImportResult(imported, alreadyMember, unknown);
    }

    /**
     * One learner's history in one course: their standing, then every node with
     * the attempts behind it.
     *
     * <p>Refuses a learner who is not on this roster, so a teacher cannot read an
     * unrelated student's work by guessing an id.</p>
     */
    @Transactional(readOnly = true)
    public RosterLearnerDetailDto rosterLearner(Long courseId, Long userId, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        Enrollment enrollment = enrollmentRepository.findByUserIdAndCourseId(userId, courseId)
                .orElseThrow(() -> ApiException.notFound("That learner is not on this roster"));
        User learner = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("Learner not found"));

        List<Module> modules = moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        Map<Long, UserModuleProgress> progress = progressRepository
                .findByUserIdAndModuleCourseId(userId, courseId)
                .stream()
                .collect(Collectors.toMap(row -> row.getModule().getId(), row -> row, (first, second) -> first));

        Map<Long, List<AttemptDto>> history = new HashMap<>();
        for (ModuleAttempt attempt : attemptRepository
                .findByUserIdAndModuleCourseIdOrderByCreatedAtAsc(userId, courseId)) {
            history.computeIfAbsent(attempt.getModule().getId(), key -> new ArrayList<>())
                    .add(new AttemptDto(
                            attempt.getScore(),
                            attempt.isPassed(),
                            attempt.getSource(),
                            attempt.getCreatedAt()));
        }

        List<LearnerNodeDto> nodes = new ArrayList<>(modules.size());
        Instant lastActivity = enrollment.getEnrolledAt();
        long cleared = 0;
        for (Module module : modules) {
            UserModuleProgress row = progress.get(module.getId());
            if (row != null && row.getStatus() == ProgressStatus.COMPLETED) {
                cleared++;
                if (row.getCompletedAt() != null && row.getCompletedAt().isAfter(lastActivity)) {
                    lastActivity = row.getCompletedAt();
                }
            }
            nodes.add(new LearnerNodeDto(
                    module.getId(),
                    module.getTitle(),
                    row == null ? ProgressStatus.LOCKED.name() : row.getStatus().name(),
                    row == null ? 0 : row.getScore(),
                    row == null ? 0 : row.getAttempts(),
                    row == null ? null : row.getCompletedAt(),
                    history.getOrDefault(module.getId(), List.of())));
        }

        return new RosterLearnerDetailDto(
                course.getId(),
                course.getTitle(),
                learner.getId(),
                learner.getName(),
                learner.getEmail(),
                learner.getTotalXp(),
                learner.getCurrentLevel(),
                learner.getStreakDays(),
                cleared,
                modules.size(),
                enrollment.getEnrolledAt(),
                lastActivity,
                nodes);
    }

    /**
     * Adds the per-principal enrollment flag and roster sizes to a page of
     * courses with one extra query each, instead of one query per card.
     */
    private List<CourseDto> withEnrollmentContext(List<Course> courses, AppUserPrincipal principal) {
        if (courses.isEmpty()) {
            return List.of();
        }
        List<Long> ids = courses.stream().map(Course::getId).toList();
        Map<Long, Long> rosterCounts = new HashMap<>();
        for (Object[] row : enrollmentRepository.countByCourseIds(ids)) {
            rosterCounts.put((Long) row[0], (Long) row[1]);
        }
        Set<Long> enrolledIds = principal.role() == Role.STUDENT
                ? enrollmentRepository.findByUserIdOrderByEnrolledAtDesc(principal.id()).stream()
                        .map(Enrollment::getCourseId)
                        .collect(Collectors.toSet())
                : Set.of();
        return courses.stream()
                .map(course -> toCourseDto(course, principal, enrolledIds, rosterCounts))
                .toList();
    }

    @Transactional(readOnly = true)
    public CourseDto getCourse(Long courseId, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanView(course, principal);
        return toCourseDto(course, principal);
    }

    @Transactional
    public CourseDto createCourse(CourseRequest request, AppUserPrincipal principal) {
        User instructor = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        boolean published = principal.role() == Role.ADMIN && Boolean.TRUE.equals(request.published());

        Course course = Course.builder()
                .title(request.title().trim())
                .description(request.description())
                .category(request.category())
                .emoji(request.emoji() == null || request.emoji().isBlank() ? "🗺️" : request.emoji())
                .published(published)
                .instructor(instructor)
                .build();

        return toCourseDto(courseRepository.save(course), principal);
    }

    /**
     * Copies a course, its whole tree and every quiz into a private draft.
     *
     * <p>Teachers run the same subject term after term, so rebuilding the tree from
     * scratch is wasted work. The copy is deliberately unpublished and owned by
     * whoever asked for it, which keeps an admin's duplicate out of the original
     * instructor's list.</p>
     */
    @Transactional
    public CourseDto duplicateCourse(Long courseId, AppUserPrincipal principal) {
        Course source = loadCourse(courseId);
        assertCanManage(source, principal);

        User owner = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));

        Course copy = courseRepository.save(Course.builder()
                .title(copyTitle(source.getTitle()))
                .description(source.getDescription())
                .category(source.getCategory())
                .emoji(source.getEmoji())
                .published(false)
                .instructor(owner)
                .build());

        List<Module> originals = moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        Map<Long, Module> copies = new LinkedHashMap<>();

        for (Module original : originals) {
            copies.put(original.getId(), moduleRepository.save(Module.builder()
                    .title(original.getTitle())
                    .summary(original.getSummary())
                    .content(original.getContent() == null ? null : original.getContent().deepCopy())
                    .xpReward(original.getXpReward())
                    .positionX(original.getPositionX())
                    .positionY(original.getPositionY())
                    .orderIndex(original.getOrderIndex())
                    .course(copy)
                    .build()));
        }

        // Parents are linked in a second pass: a prerequisite can be copied after the
        // node that depends on it.
        for (Module original : originals) {
            if (original.getParentModule() != null) {
                copies.get(original.getId())
                        .setParentModule(copies.get(original.getParentModule().getId()));
            }
        }
        moduleRepository.saveAll(copies.values());

        for (Module original : originals) {
            quizRepository.findByModuleId(original.getId()).ifPresent(quiz -> quizRepository.save(Quiz.builder()
                    .module(copies.get(original.getId()))
                    .type(quiz.getType())
                    .passingScore(quiz.getPassingScore())
                    .payload(quiz.getPayload().deepCopy())
                    .build()));
        }

        return toCourseDto(copy, principal);
    }

    /** Keeps the "(copy)" marker inside the 160-character title column. */
    private static String copyTitle(String title) {
        String suffix = " (copy)";
        if (title.length() + suffix.length() <= 160) {
            return title + suffix;
        }
        return title.substring(0, 160 - suffix.length()).trim() + suffix;
    }

    @Transactional
    public CourseDto updateCourse(Long courseId, CourseUpdateRequest request, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        course.setTitle(request.title().trim());
        course.setDescription(blankToNull(request.description()));
        course.setCategory(blankToNull(request.category()));
        String emoji = request.emoji() == null ? "" : request.emoji().trim();
        course.setEmoji(emoji.isEmpty() ? "🗺️" : emoji);

        return toCourseDto(courseRepository.save(course), principal);
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Transactional
    public CourseDto setPublished(Long courseId, boolean published, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);
        if (published && course.getArchivedAt() != null) {
            throw ApiException.badRequest("Restore the course before publishing it");
        }
        course.setPublished(published);
        Course saved = courseRepository.save(course);
        auditService.record(principal, published ? "course.published" : "course.unpublished",
                course.getTitle(), "Course id " + course.getId());
        return toCourseDto(saved, principal);
    }

    /**
     * Archives a finished term, or restores it as a draft.
     *
     * <p>Archiving unpublishes the course, so every student-facing query that
     * filters on published stops showing it without a second rule to remember.
     * Restoring deliberately leaves it a draft: nobody should reappear in a live
     * course by accident.</p>
     */
    @Transactional
    public CourseDto setArchived(Long courseId, boolean archived, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        if (archived) {
            course.setArchivedAt(Instant.now());
            course.setPublished(false);
        } else {
            course.setArchivedAt(null);
        }

        Course saved = courseRepository.save(course);
        auditService.record(principal, archived ? "course.archived" : "course.restored",
                course.getTitle(), "Course id " + course.getId()
                        + (archived ? "; also unpublished" : "; left as a draft"));
        return toCourseDto(saved, principal);
    }

    /**
     * Deletes a draft nobody has worked through.
     *
     * <p>Progress and attempts are the learner's history, so a course that has any
     * is refused rather than silently deleting somebody's scores. A published
     * course must be unpublished first, which makes the destructive step explicit.</p>
     */
    @Transactional
    public void deleteCourse(Long courseId, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        if (course.isPublished()) {
            throw ApiException.badRequest("Unpublish the course before deleting it");
        }
        if (progressRepository.countByModuleCourseId(courseId) > 0
                || attemptRepository.countByModuleCourseId(courseId) > 0) {
            throw ApiException.badRequest("Students have progress here - archive it instead of deleting");
        }

        List<Module> modules = moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId);
        List<String> videos = modules.stream()
                .map(Module::getContent)
                .filter(Objects::nonNull)
                .map(content -> content.path("videoUrl"))
                .filter(JsonNode::isTextual)
                .map(JsonNode::asText)
                .filter(url -> !url.isBlank())
                .toList();

        // Clear prerequisites first: a parent and its child deleted together would
        // fight over the self-referencing foreign key.
        for (Module module : modules) {
            module.setParentModule(null);
        }
        moduleRepository.saveAll(modules);

        courseRepository.delete(course);
        courseRepository.flush();

        auditService.record(principal, "course.deleted", course.getTitle(),
                "Course id " + courseId + " deleted");

        videos.forEach(mediaStorageService::deleteStored);
    }

    @Transactional
    public Module addModule(Long courseId, ModuleRequest request, AppUserPrincipal principal) {
        Course course = loadCourse(courseId);
        assertCanManage(course, principal);

        Module parent = null;
        if (request.parentModuleId() != null) {
            parent = moduleRepository.findById(request.parentModuleId())
                    .orElseThrow(() -> ApiException.badRequest("Parent module does not exist"));
            if (!parent.getCourse().getId().equals(courseId)) {
                throw ApiException.badRequest("Parent module belongs to a different course");
            }
        }

        long existing = moduleRepository.countByCourseId(courseId);
        int orderIndex = request.orderIndex() != null ? request.orderIndex() : (int) existing;

        Module module = Module.builder()
                .title(request.title().trim())
                .summary(request.summary())
                .content(request.content())
                .xpReward(request.xpReward() != null ? request.xpReward() : 100)
                .positionX(request.positionX() != null ? request.positionX() : 0)
                .positionY(request.positionY() != null ? request.positionY() : orderIndex)
                .orderIndex(orderIndex)
                .course(course)
                .parentModule(parent)
                .build();

        return moduleRepository.save(module);
    }

    @Transactional
    public Module updateModule(Long moduleId, ModuleUpdateRequest request, AppUserPrincipal principal) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        assertCanManage(module.getCourse(), principal);

        module.setTitle(request.title().trim());
        String summary = request.summary() == null ? null : request.summary().trim();
        module.setSummary(summary == null || summary.isEmpty() ? null : summary);
        if (request.xpReward() != null) {
            module.setXpReward(request.xpReward());
        }
        module.setContent(lessonKeepingMedia(module.getContent(), request.content()));

        return moduleRepository.save(module);
    }

    /**
     * The lesson editor owns the prose; the media endpoints own the video. Copy the
     * request's lesson over and then put back the video fields still on the node, so
     * saving a lesson can never silently delete a teacher's uploaded film.
     */
    private static JsonNode lessonKeepingMedia(JsonNode existing, JsonNode incoming) {
        ObjectNode next = JsonNodeFactory.instance.objectNode();
        if (incoming != null && incoming.isObject()) {
            next.setAll((ObjectNode) incoming);
        }
        if (existing != null && existing.isObject()) {
            for (String field : List.of("videoUrl", "videoLabel")) {
                JsonNode value = existing.get(field);
                if (value != null && !value.isNull() && !value.asText().isBlank()) {
                    next.set(field, value);
                }
            }
        }
        return next.isEmpty() ? null : next;
    }

    @Transactional
    public Quiz attachQuiz(Long moduleId, QuizRequest request, AppUserPrincipal principal) {
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
        assertCanManage(module.getCourse(), principal);
        quizService.validate(request.type(), request.payload());

        Quiz quiz = quizRepository.findByModuleId(moduleId).orElseGet(() -> Quiz.builder()
                .module(module)
                .build());
        quiz.setType(request.type());
        quiz.setPassingScore(request.passingScore() != null ? request.passingScore() : 60);
        quiz.setPayload(request.payload());

        return quizRepository.save(quiz);
    }

    @Transactional(readOnly = true)
    public Module getModuleEntity(Long moduleId) {
        return moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));
    }

    public Course loadCourse(Long courseId) {
        return courseRepository.findById(courseId)
                .orElseThrow(() -> ApiException.notFound("Course not found"));
    }

    public void assertCanManage(Course course, AppUserPrincipal principal) {
        if (principal.role() == Role.ADMIN) {
            return;
        }
        if (principal.role() == Role.INSTRUCTOR
                && course.getInstructor() != null
                && course.getInstructor().getId().equals(principal.id())) {
            return;
        }
        throw ApiException.forbidden("Only the course instructor or an admin can do that");
    }

    public void assertCanView(Course course, AppUserPrincipal principal) {
        if (principal.role() == Role.ADMIN) {
            return;
        }
        if (course.isPublished() && course.isMembershipRequired()
                && principal.role() == Role.STUDENT
                && !enrollmentRepository.existsByUserIdAndCourseId(principal.id(), course.getId())) {
            throw ApiException.forbidden("This course is only open to the class it was created for");
        }
        if (course.isPublished()) {
            return;
        }
        if (principal.role() == Role.INSTRUCTOR
                && course.getInstructor() != null
                && course.getInstructor().getId().equals(principal.id())) {
            return;
        }
        // An archived term is also unpublished, but telling a student it is "not
        // published yet" implies it is coming back. It is not, to them.
        if (course.getArchivedAt() != null) {
            throw ApiException.forbidden("This course is no longer available");
        }
        throw ApiException.forbidden("This course is not published yet");
    }

    private CourseDto toCourseDto(Course course, AppUserPrincipal principal) {
        return toCourseDto(course, principal, null, null);
    }

    /**
     * @param enrolledIds   the caller's enrollments when a page is being mapped, or
     *                      {@code null} to ask for this one course
     * @param rosterCounts  counts for the whole page when available, or
     *                      {@code null} to count this one course
     */
    private CourseDto toCourseDto(Course course, AppUserPrincipal principal,
                                  Set<Long> enrolledIds, Map<Long, Long> rosterCounts) {
        long moduleCount = moduleRepository.countByCourseId(course.getId());
        long completed = 0;
        if (principal.role() != Role.INSTRUCTOR) {
            completed = progressRepository.countByUserIdAndModuleCourseIdAndStatus(
                    principal.id(), course.getId(), ProgressStatus.COMPLETED);
        }
        List<Long> moduleIds = moduleRepository.findByCourseIdOrderByOrderIndexAsc(course.getId())
                .stream().map(Module::getId).toList();
        if (moduleIds.isEmpty()) {
            completed = 0;
        }

        boolean enrolled = enrolledIds != null
                ? enrolledIds.contains(course.getId())
                : principal.role() == Role.STUDENT
                        && enrollmentRepository.existsByUserIdAndCourseId(principal.id(), course.getId());
        long enrolledCount = rosterCounts != null
                ? rosterCounts.getOrDefault(course.getId(), 0L)
                : enrollmentRepository.countByCourseId(course.getId());

        return new CourseDto(
                course.getId(),
                course.getTitle(),
                course.getDescription(),
                course.getCategory(),
                course.getEmoji(),
                course.isPublished(),
                course.getInstructor() == null ? null : course.getInstructor().getId(),
                course.getInstructor() == null ? "QuestLearn" : course.getInstructor().getName(),
                moduleCount,
                completed,
                enrolledCount,
                enrolled,
                course.isMembershipRequired(),
                course.getCreatedAt(),
                course.getArchivedAt()
        );
    }

    /** Convenience used by the dashboard: module ids for a course in order. */
    public List<Long> moduleIds(Long courseId) {
        List<Long> ids = new ArrayList<>();
        moduleRepository.findByCourseIdOrderByOrderIndexAsc(courseId)
                .forEach(m -> ids.add(m.getId()));
        return ids;
    }
}
