package com.questlearn.service;

import com.questlearn.dto.AdminStatsDto;
import com.questlearn.dto.AdminUserPage;
import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AuditEntryDto;
import com.questlearn.dto.TempPasswordResponse;
import com.questlearn.dto.UserDto;
import com.questlearn.exception.ApiException;
import com.questlearn.mapper.DtoMapper;
import com.questlearn.model.Module;
import com.questlearn.model.ProgressStatus;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.model.UserModuleProgress;
import com.questlearn.repository.CourseRepository;
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
     * Reverts one node for one learner so they can attempt it again. XP awarded for
     * that node is removed and the level is recomputed; other nodes are untouched.
     */
    @Transactional
    public UserDto resetProgress(Long userId, Long moduleId, AppUserPrincipal principal) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        Module module = moduleRepository.findById(moduleId)
                .orElseThrow(() -> ApiException.notFound("Module not found"));

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
