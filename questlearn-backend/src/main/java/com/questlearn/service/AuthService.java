package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AuthResponse;
import com.questlearn.dto.ChangePasswordRequest;
import com.questlearn.dto.LoginRequest;
import com.questlearn.dto.RegisterRequest;
import com.questlearn.dto.UserDto;
import com.questlearn.exception.ApiException;
import com.questlearn.mapper.DtoMapper;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.UserRepository;
import com.questlearn.security.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final LoginAttemptService loginAttemptService;
    private final EmailVerificationService emailVerificationService;
    private final String instructorInviteCode;
    private final String studentInviteCode;
    private final boolean requireStudentCode;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtUtil jwtUtil,
                       LoginAttemptService loginAttemptService,
                       EmailVerificationService emailVerificationService,
                       @Value("${questlearn.registration.instructor-invite-code:}") String instructorInviteCode,
                       @Value("${questlearn.registration.student-invite-code:}") String studentInviteCode,
                       @Value("${questlearn.registration.require-student-code:false}") boolean requireStudentCode) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.loginAttemptService = loginAttemptService;
        this.emailVerificationService = emailVerificationService;
        this.instructorInviteCode = instructorInviteCode;
        this.studentInviteCode = studentInviteCode;
        this.requireStudentCode = requireStudentCode;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (request.role() == Role.ADMIN) {
            throw ApiException.forbidden("Admin accounts cannot be self-registered");
        }
        if (request.role() == Role.INSTRUCTOR) {
            assertInstructorInviteCode(request.inviteCode());
        }
        if (request.role() == Role.STUDENT) {
            assertStudentInviteCode(request.inviteCode());
        }

        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("An account with that email already exists");
        }

        User user = User.builder()
                .name(request.name().trim())
                .email(email)
                .passwordHash(passwordEncoder.encode(request.password()))
                .role(request.role())
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .emailVerified(false)
                .build();
        userRepository.save(user);

        // Soft verification: the account already works, but a confirmation link
        // goes out so the dashboard can stop reminding them.
        emailVerificationService.issue(user);
        return toAuthResponse(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        loginAttemptService.assertNotLocked(email);

        User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> ApiException.unauthorized("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            loginAttemptService.recordFailure(email);
            throw ApiException.unauthorized("Invalid email or password");
        }
        loginAttemptService.recordSuccess(email);
        return toAuthResponse(user);
    }

    /**
     * Lets a signed-in learner or instructor rotate their own password without
     * waiting for an email round-trip.
     *
     * <p>Every other session is revoked by bumping the token version. The caller
     * is handed a fresh token so the browser that made the change stays signed in.</p>
     */
    @Transactional
    public AuthResponse changePassword(AppUserPrincipal principal, ChangePasswordRequest request) {
        User user = loadUser(principal.id());
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("Current password is incorrect");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("New password must be different from the current one");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setTokenVersion(user.getTokenVersion() + 1);
        userRepository.save(user);
        return toAuthResponse(user);
    }

    @Transactional(readOnly = true)
    public UserDto currentUser(AppUserPrincipal principal) {
        return DtoMapper.toUserDto(loadUser(principal.id()));
    }

    public User loadUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));
    }

    /**
     * Institution code gate for student sign-up. A deployment that requires the code
     * but has not configured one fails closed: an unset secret must never mean "everyone
     * may register". The two codes are independent, so a student code can never be used
     * to create an instructor.
     */
    private void assertStudentInviteCode(String supplied) {
        String configured = normaliseCode(studentInviteCode);
        if (configured.isEmpty()) {
            if (requireStudentCode) {
                throw ApiException.forbidden("Student sign-up is closed on this deployment.");
            }
            return;
        }
        if (!constantTimeEquals(configured, normaliseCode(supplied))) {
            throw ApiException.forbidden("Enter the institution code your teacher gave you.");
        }
    }

    /** Trims and case-folds so " AbC-123 " matches "abc-123". */
    private String normaliseCode(String code) {
        return code == null ? "" : code.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private boolean constantTimeEquals(String configured, String candidate) {
        return MessageDigest.isEqual(configured.getBytes(StandardCharsets.UTF_8),
                candidate.getBytes(StandardCharsets.UTF_8));
    }

    private void assertInstructorInviteCode(String supplied) {
        String configured = instructorInviteCode == null ? "" : instructorInviteCode.trim();
        if (configured.isEmpty()) {
            throw ApiException.forbidden(
                    "Instructor sign-up is disabled on this deployment. Ask an admin for an account.");
        }
        String candidate = supplied == null ? "" : supplied.trim();
        if (!constantTimeEquals(configured, candidate)) {
            throw ApiException.forbidden("Instructor sign-up needs a valid invite code");
        }
    }

    private AuthResponse toAuthResponse(User user) {
        return new AuthResponse(
                jwtUtil.generateToken(user),
                "Bearer",
                jwtUtil.getExpirationMs(),
                DtoMapper.toUserDto(user));
    }
}
