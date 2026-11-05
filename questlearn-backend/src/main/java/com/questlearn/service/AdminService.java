package com.questlearn.service;

import com.questlearn.dto.AdminStatsDto;
import com.questlearn.dto.AppUserPrincipal;
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

    @Transactional(readOnly = true)
    public List<UserDto> listUsers() {
        return userRepository.findAll().stream()
                .map(DtoMapper::toUserDto)
                .toList();
    }

    @Transactional
    public UserDto updateRole(Long userId, Role role, AppUserPrincipal principal) {
        if (userId.equals(principal.id())) {
            throw ApiException.badRequest("You cannot change your own role");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        user.setRole(role);
        return DtoMapper.toUserDto(userRepository.save(user));
    }

    /**
     * Support path for a forgotten password: an admin issues a one-time temporary
     * password and hands it over out of band. The value is returned exactly once
     * and is never logged or stored in plain text.
     */
    @Transactional
    public TempPasswordResponse resetPassword(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        String temporaryPassword = randomPassword();
        user.setPasswordHash(passwordEncoder.encode(temporaryPassword));
        userRepository.save(user);
        return new TempPasswordResponse(user.getId(), user.getEmail(), temporaryPassword);
    }

    /**
     * Reverts one node for one learner so they can attempt it again. XP awarded for
     * that node is removed and the level is recomputed; other nodes are untouched.
     */
    @Transactional
    public UserDto resetProgress(Long userId, Long moduleId) {
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

        return DtoMapper.toUserDto(user);
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
