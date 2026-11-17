package com.questlearn.service;

import com.questlearn.dto.AdminStatsDto;
import com.questlearn.dto.AdminUserPage;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AuditEntryDto;
import com.questlearn.dto.DemoAccountSummary;
import com.questlearn.dto.DemoPasswordRotation;
import com.questlearn.dto.DemoPasswordStatus;
import com.questlearn.dto.TempPasswordResponse;
import com.questlearn.dto.UserDto;
import com.questlearn.exception.ApiException;
import com.questlearn.mapper.DtoMapper;
import com.questlearn.model.DemoCredential;
import com.questlearn.model.Module;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.DemoCredentialRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminService {

    /** Ambiguous characters (0/O, 1/l/I) are omitted so a temp password can be read aloud. */
    private static final String PASSWORD_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private static final int TEMP_PASSWORD_LENGTH = 12;

    private final UserRepository userRepository;
    private final CourseRepository courseRepository;
    private final ModuleRepository moduleRepository;
    private final UserModuleProgressRepository progressRepository;
    private final ModuleAttemptRepository attemptRepository;
    private final DemoCredentialRepository demoCredentialRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditService auditService;

    /**
     * @param query optional case-insensitive fragment of a name or email. Every
     *              row is returned when it is blank, which keeps the endpoint
     *              usable at classroom size without a page envelope.
     */
    @Transactional(readOnly = true)
    /**
     * One page of accounts, newest id order kept stable so paging does not shuffle.
     *
     * @param size clamped here rather than trusted from the query string, so one
     *             request cannot ask for the whole school
     */
    public AdminUserPage listUsers(String query, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        Pageable pageable = PageRequest.of(Math.max(page, 0), safeSize, Sort.by(Sort.Direction.ASC, "id"));
        String term = query == null ? "" : query.trim();

        Page<User> found = term.isEmpty()
                ? userRepository.findAll(pageable)
                : userRepository.findByNameContainingIgnoreCaseOrEmailContainingIgnoreCase(
                        term, term, pageable);

        return new AdminUserPage(
                found.getContent().stream().map(DtoMapper::toUserDto).toList(),
                found.getTotalElements(),
                found.getNumber(),
                found.getSize(),
                found.getTotalPages());
    }

    @Transactional
    public UserDto updateRole(Long userId, Role role, AppUserPrincipal principal) {
        if (userId.equals(principal.id())) {
            throw ApiException.badRequest("You cannot change your own role");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        Role previous = user.getRole();
        user.setRole(role);
        User saved = userRepository.save(user);
        if (previous != role) {
            // The JWT filter reads the role from this row, so the change is live
            // on the target's next request without forcing them to sign in again.
            auditService.record(principal, "user.role_changed", user.getEmail(),
                    "Role changed from " + previous + " to " + role);
        }
        return DtoMapper.toUserDto(saved);
    }

    /**
     * Support path for a forgotten password: an admin issues a one-time temporary
     * password and hands it over out of band. The value is returned exactly once
     * and is never logged or stored in plain text.
     *
     * <p>Any session the account already had is revoked, so a reset always means
     * "the old credentials and the old browser are out".</p>
     */
    @Transactional
    public TempPasswordResponse resetPassword(Long userId, AppUserPrincipal principal) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        String temporaryPassword = randomPassword();
        user.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);
        auditService.record(principal, "user.password_reset", user.getEmail(),
                "One-time temporary password issued; existing sessions revoked");
        return new TempPasswordResponse(user.getId(), user.getEmail(), temporaryPassword);
    }

    /**
     * Deletes an account and the work attached to it. Two guards are deliberate:
     * an admin cannot remove themselves, which would strand the console, and the
     * last admin cannot be removed at all. An instructor who still owns a course is
     * refused with the reason, because the database holds that foreign key and a raw
     * failure would read as a bug rather than a decision.
     *
     * <p>Progress rows and attempts have no cascade, so they go first. Enrolments,
     * class memberships, reset tokens and reminders cascade in the schema.</p>
     */
    @Transactional
    public void deleteUser(Long userId, AppUserPrincipal principal) {
        if (userId.equals(principal.id())) {
            throw ApiException.badRequest("You cannot delete your own account");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));

        if (user.getRole() == Role.ADMIN && userRepository.countByRole(Role.ADMIN) <= 1) {
            throw ApiException.badRequest("The last admin cannot be deleted");
        }
        if (!courseRepository.findByInstructorIdOrderByIdAsc(userId).isEmpty()) {
            throw ApiException.badRequest(
                    "Move or delete this instructor's courses before deleting the account");
        }

        attemptRepository.deleteByUserId(userId);
        progressRepository.deleteByUserId(userId);
        userRepository.delete(user);

        auditService.record(principal, "user.deleted", user.getEmail(),
                "Account deleted: " + user.getName() + " (" + user.getRole() + ")");
    }

    /**
     * Reverts one node for one learner so they can attempt it again. XP awarded for
     * that node is removed and the level is recomputed; other nodes are untouched.
     */
    @Transactional
    public UserDto resetProgress(Long userId, Long moduleId, AppUserPrincipal principal) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));

        // A teacher may only undo work in a course they own; the class instructor is
        // who a "please let me retry" request actually reaches.
        if (principal.role() == Role.INSTRUCTOR
                && (module.getCourse() == null || module.getCourse().getInstructor() == null
                || !principal.id().equals(module.getCourse().getInstructor().getId()))) {
            throw ApiException.forbidden("You can only reset progress in your own course");
        }

        UserModuleProgress progress = progressRepository
                .findByUserIdAndModuleId(userId, moduleId)
                .orElseThrow(() -> ApiException.notFound(
                        "This learner has no progress on that node"));

        if (progress.getStatus() == ProgressStatus.COMPLETED) {
            user.setTotalXp(Math.max(0, user.getTotalXp() - module.getXpReward()));
            user.setCurrentLevel(GamificationService.levelForXp(user.getTotalXp()));
            userRepository.save(user);
        }

        progress.setStatus(initialStatus(userId, module));
        progress.setScore(0);
        progress.setAttempts(0);
        progress.setCompletedAt(null);
        progressRepository.save(progress);

        auditService.record(principal, "user.progress_reset", user.getEmail(),
                "Node '" + module.getTitle() + "' (id " + moduleId + ") reset to "
                        + progress.getStatus());

        return DtoMapper.toUserDto(user);
    }

    @Transactional(readOnly = true)
    public List<AuditEntryDto> auditTrail() {
        return auditService.recent();
    }

    @Transactional(readOnly = true)
    public AdminStatsDto stats() {
        return new AdminStatsDto(
                userRepository.count(),
                userRepository.countByRole(Role.STUDENT),
                userRepository.countByRole(Role.INSTRUCTOR),
                userRepository.countByRole(Role.ADMIN),
                courseRepository.count(),
                courseRepository.countByPublishedTrue()
        );
    }

    /**
     * What the console can honestly say about the shared demo password: how many
     * accounts share it, and whether it came from this console or from the startup
     * configuration. The password itself is a hash here, so it cannot be shown.
     */
    @Transactional(readOnly = true)
    public DemoPasswordStatus demoPasswordStatus() {
        // Built from the rows rather than the constant: if an admin deletes one of
        // the five, the console should say four and stop listing the missing one.
        List<DemoAccountSummary> logins = DemoAccounts.EMAILS.stream()
                .map(email -> userRepository.findByEmailIgnoreCase(email).orElse(null))
                .filter(user -> user != null)
                .map(user -> new DemoAccountSummary(
                        user.getName(), user.getEmail(), user.getRole().name()))
                .toList();

        return demoCredentialRepository.findById(DemoCredential.SINGLETON_ID)
                .map(row -> new DemoPasswordStatus(logins.size(), logins, "ROTATED",
                        row.getRotatedAt(), row.getRotatedBy()))
                .orElseGet(() -> new DemoPasswordStatus(logins.size(), logins, "STARTUP",
                        null, null));
    }

    /**
     * Gives all five demo accounts a new shared password and remembers that choice,
     * so the next start does not put the environment value back. The value is
     * returned once for the admin to hand on; sessions are left alone, because a
     * password change is not a compromise and ending the demo's own session would
     * be the first thing that breaks here.
     */
    @Transactional
    public DemoPasswordRotation rotateDemoPassword(AppUserPrincipal principal) {
        String password = randomPassword();
        String hash = passwordEncoder.encode(password);

        int updated = 0;
        for (String email : DemoAccounts.EMAILS) {
            User user = userRepository.findByEmailIgnoreCase(email).orElse(null);
            if (user == null) {
                continue;
            }
            user.setPasswordHash(hash);
            userRepository.save(user);
            updated += 1;
        }

        if (updated == 0) {
            throw ApiException.badRequest("No demo accounts exist on this database");
        }

        demoCredentialRepository.save(DemoCredential.builder()
                .id(DemoCredential.SINGLETON_ID)
                .passwordHash(hash)
                .rotatedAt(Instant.now())
                .rotatedBy(principal.email())
                .build());

        auditService.record(principal, "demo.password_rotated", "demo accounts",
                "Shared demo password rotated for " + updated + " accounts");

        return new DemoPasswordRotation(password, updated);
    }

    private ProgressStatus initialStatus(Long userId, Module module) {
        if (module.getParentModule() == null) {
            return ProgressStatus.UNLOCKED;
        }
        boolean parentCompleted = progressRepository
                .findByUserIdAndModuleId(userId, module.getParentModule().getId())
                .map(parent -> parent.getStatus() == ProgressStatus.COMPLETED)
                .orElse(false);
        return parentCompleted ? ProgressStatus.UNLOCKED : ProgressStatus.LOCKED;
    }

    private String randomPassword() {
        SecureRandom random = new SecureRandom();
        StringBuilder builder = new StringBuilder(TEMP_PASSWORD_LENGTH);
        for (int i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
            builder.append(PASSWORD_ALPHABET.charAt(random.nextInt(PASSWORD_ALPHABET.length())));
        }
        return builder.toString();
    }
}
