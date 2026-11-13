package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AuthResponse;
import com.questlearn.dto.ChangePasswordRequest;
import com.questlearn.dto.LoginRequest;
import com.questlearn.dto.RegisterRequest;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.UserRepository;
import com.questlearn.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceTest {

    private static final String INVITE = "prof-kade-2026";
    private static final String STUDENT_CODE = "class-of-2026";

    private final UserRepository userRepository = mock(UserRepository.class);
    private final JwtUtil jwtUtil = mock(JwtUtil.class);
    private final LoginAttemptService loginAttemptService = mock(LoginAttemptService.class);
    /** Low cost factor keeps the suite fast; production uses the default. */
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, passwordEncoder, jwtUtil,
                loginAttemptService, INVITE, "", false);
        when(jwtUtil.generateToken(any())).thenReturn("signed-token");
        when(jwtUtil.getExpirationMs()).thenReturn(86_400_000L);
        when(userRepository.save(any(User.class))).thenAnswer(call -> call.getArgument(0));
    }

    // ------------------------------------------------------------ registration

    @Test
    void studentSignUpNormalisesTheEmailAndHashesThePassword() {
        when(userRepository.existsByEmailIgnoreCase("leo@questlearn.dev")).thenReturn(false);

        AuthResponse response = authService.register(new RegisterRequest(
                "  Leo the Learner  ", "  LEO@QuestLearn.dev ", "secret123", Role.STUDENT, null));

        assertEquals("leo@questlearn.dev", response.user().email());
        assertEquals("Leo the Learner", response.user().name());
        assertEquals(Role.STUDENT, response.user().role());
        assertEquals("signed-token", response.token());

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertTrue(passwordEncoder.matches("secret123", saved.getValue().getPasswordHash()),
                "the stored value must be a BCrypt hash of the password");
    }

    @Test
    void adminAccountsCannotBeSelfRegistered() {
        ApiException error = assertThrows(ApiException.class, () -> authService.register(
                new RegisterRequest("Aria", "aria@questlearn.dev", "secret123", Role.ADMIN, null)));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    @Test
    void instructorSignUpWithoutAnInviteCodeIsRejected() {
        ApiException error = assertThrows(ApiException.class, () -> authService.register(
                new RegisterRequest("Kade", "kade@questlearn.dev", "secret123", Role.INSTRUCTOR, null)));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    @Test
    void instructorSignUpWithAWrongInviteCodeIsRejected() {
        ApiException error = assertThrows(ApiException.class, () -> authService.register(
                new RegisterRequest("Kade", "kade@questlearn.dev", "secret123", Role.INSTRUCTOR, "guess")));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    @Test
    void instructorSignUpWithTheInviteCodeSucceeds() {
        when(userRepository.existsByEmailIgnoreCase("kade@questlearn.dev")).thenReturn(false);

        AuthResponse response = authService.register(new RegisterRequest(
                "Professor Kade", "kade@questlearn.dev", "secret123", Role.INSTRUCTOR, INVITE));

        assertEquals(Role.INSTRUCTOR, response.user().role());
    }

    @Test
    void duplicateEmailsAreRejectedWith409() {
        when(userRepository.existsByEmailIgnoreCase("leo@questlearn.dev")).thenReturn(true);

        ApiException error = assertThrows(ApiException.class, () -> authService.register(
                new RegisterRequest("Leo", "leo@questlearn.dev", "secret123", Role.STUDENT, null)));
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    // ------------------------------------------------------------------- login

    @Test
    void unknownEmailIsA401() {
        when(userRepository.findByEmailIgnoreCase("ghost@questlearn.dev")).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> authService.login(new LoginRequest("ghost@questlearn.dev", "secret123")));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
    }

    @Test
    void wrongPasswordIsA401AndCountsAsAFailedAttempt() {
        User user = existingUser(3L, "leo@questlearn.dev", Role.STUDENT, "secret123");
        when(userRepository.findByEmailIgnoreCase("leo@questlearn.dev")).thenReturn(Optional.of(user));

        ApiException error = assertThrows(ApiException.class,
                () -> authService.login(new LoginRequest("leo@questlearn.dev", "wrong-password")));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
        verify(loginAttemptService).recordFailure("leo@questlearn.dev");
        verify(loginAttemptService, never()).recordSuccess(any());
    }

    @Test
    void successfulLoginClearsTheFailureCounter() {
        User user = existingUser(3L, "leo@questlearn.dev", Role.STUDENT, "secret123");
        when(userRepository.findByEmailIgnoreCase("leo@questlearn.dev")).thenReturn(Optional.of(user));

        AuthResponse response = authService.login(new LoginRequest("LEO@questlearn.dev", "secret123"));

        assertEquals("signed-token", response.token());
        verify(loginAttemptService).recordSuccess("leo@questlearn.dev");
        verify(loginAttemptService, never()).recordFailure(any());
    }

    // --------------------------------------------------------- change password

    @Test
    void changingPasswordRequiresTheCurrentOne() {
        User user = existingUser(3L, "leo@questlearn.dev", Role.STUDENT, "secret123");
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));

        ApiException error = assertThrows(ApiException.class,
                () -> authService.changePassword(principal(3L),
                        new ChangePasswordRequest("not-my-password", "brand-new-pass")));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
    }

    @Test
    void changingPasswordStoresTheNewHash() {
        User user = existingUser(3L, "leo@questlearn.dev", Role.STUDENT, "secret123");
        user.setTokenVersion(4);
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));

        AuthResponse response = authService.changePassword(principal(3L),
                new ChangePasswordRequest("secret123", "brand-new-pass"));

        assertTrue(passwordEncoder.matches("brand-new-pass", user.getPasswordHash()));
        // Bumping the version is what signs every other browser out.
        assertEquals(5, user.getTokenVersion());
        assertEquals("signed-token", response.token());
        verify(userRepository).save(user);
    }

    @Test
    void reusingTheCurrentPasswordIsRejected() {
        User user = existingUser(3L, "leo@questlearn.dev", Role.STUDENT, "secret123");
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));

        ApiException error = assertThrows(ApiException.class,
                () -> authService.changePassword(principal(3L),
                        new ChangePasswordRequest("secret123", "secret123")));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatus());
    }

    // ------------------------------------------------------- institution code

    /** A deployment where the class code is configured and enforced. */
    private AuthService gatedService(boolean requireCode) {
        return new AuthService(userRepository, passwordEncoder, jwtUtil,
                loginAttemptService, INVITE, STUDENT_CODE, requireCode);
    }

    @Test
    void studentSignUpWithTheInstitutionCodeSucceeds() {
        when(userRepository.existsByEmailIgnoreCase("mira@questlearn.dev")).thenReturn(false);

        AuthResponse response = gatedService(true).register(new RegisterRequest(
                "Mira the Mage", "mira@questlearn.dev", "secret123", Role.STUDENT, STUDENT_CODE));

        assertEquals(Role.STUDENT, response.user().role());
    }

    @Test
    void studentSignUpWithAWrongInstitutionCodeIsRejected() {
        ApiException error = assertThrows(ApiException.class, () -> gatedService(true).register(
                new RegisterRequest("Mira", "mira@questlearn.dev", "secret123", Role.STUDENT, "guess")));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    @Test
    void studentSignUpWithoutAnyCodeIsRejectedWhenTheCodeIsConfigured() {
        ApiException error = assertThrows(ApiException.class, () -> gatedService(false).register(
                new RegisterRequest("Mira", "mira@questlearn.dev", "secret123", Role.STUDENT, null)));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    @Test
    void studentSignUpFailsClosedWhenTheCodeIsRequiredButUnset() {
        AuthService unconfigured = new AuthService(userRepository, passwordEncoder, jwtUtil,
                loginAttemptService, INVITE, "", true);

        ApiException error = assertThrows(ApiException.class, () -> unconfigured.register(
                new RegisterRequest("Mira", "mira@questlearn.dev", "secret123", Role.STUDENT, "")));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        assertEquals("Student sign-up is closed on this deployment.", error.getMessage());
        verify(userRepository, never()).save(any());
    }

    @Test
    void institutionCodeIgnoresCaseAndSurroundingWhitespace() {
        when(userRepository.existsByEmailIgnoreCase("mira@questlearn.dev")).thenReturn(false);

        AuthResponse response = gatedService(true).register(new RegisterRequest(
                "Mira", "mira@questlearn.dev", "secret123", Role.STUDENT, "  CLASS-Of-2026 "));

        assertEquals(Role.STUDENT, response.user().role());
    }

    @Test
    void theStudentCodeCannotCreateAnInstructor() {
        ApiException error = assertThrows(ApiException.class, () -> gatedService(true).register(
                new RegisterRequest("Kade", "kade@questlearn.dev", "secret123", Role.INSTRUCTOR,
                        STUDENT_CODE)));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus());
        verify(userRepository, never()).save(any());
    }

    private User existingUser(Long id, String email, Role role, String rawPassword) {
        return User.builder()
                .id(id)
                .name("Leo the Learner")
                .email(email)
                .passwordHash(passwordEncoder.encode(rawPassword))
                .role(role)
                .totalXp(220)
                .currentLevel(2)
                .streakDays(4)
                .build();
    }

    private AppUserPrincipal principal(Long id) {
        return new AppUserPrincipal(id, "leo@questlearn.dev", Role.STUDENT);
    }
}
