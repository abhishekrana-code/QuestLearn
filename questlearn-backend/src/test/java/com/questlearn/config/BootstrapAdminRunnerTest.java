package com.questlearn.config;

import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BootstrapAdminRunnerTest {

    private static final String EMAIL = "admin@school.example";
    private static final String PASSWORD = "correct-horse-battery";

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);

    private BootstrapAdminRunner runner(String email, String password) {
        return new BootstrapAdminRunner(userRepository, passwordEncoder,
                email, "Head Teacher", password);
    }

    @Test
    void createsTheAdminWhenNoneExists() {
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(0L);
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);
        when(userRepository.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        runner(EMAIL, PASSWORD).run(null);

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertEquals(EMAIL, saved.getValue().getEmail());
        assertEquals(Role.ADMIN, saved.getValue().getRole());
        assertEquals("Head Teacher", saved.getValue().getName());
        assertTrue(passwordEncoder.matches(PASSWORD, saved.getValue().getPasswordHash()));
    }

    @Test
    void doesNothingWhenAnAdminAlreadyExists() {
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(1L);

        runner(EMAIL, PASSWORD).run(null);

        verify(userRepository, never()).save(any());
    }

    @Test
    void doesNothingWhenBothVariablesAreUnset() {
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(0L);

        runner("", "").run(null);

        verify(userRepository, never()).save(any());
    }

    @Test
    void refusesAShortPassword() {
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(0L);

        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> runner(EMAIL, "short").run(null));

        assertTrue(error.getMessage().contains(String.valueOf(BootstrapAdminRunner.MIN_PASSWORD_LENGTH)));
        verify(userRepository, never()).save(any());
    }

    @Test
    void refusesWhenOnlyOneOfTheTwoVariablesIsSet() {
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(0L);

        assertThrows(IllegalStateException.class, () -> runner(EMAIL, "").run(null));
        verify(userRepository, never()).save(any());
    }

    @Test
    void refusesToShadowAnExistingNonAdminEmail() {
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(0L);
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(true);

        assertThrows(IllegalStateException.class, () -> runner(EMAIL, PASSWORD).run(null));
        verify(userRepository, never()).save(any());
    }

    @Test
    void lowercasesTheEmailSoLoginIsCaseInsensitive() {
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(0L);
        when(userRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(false);
        when(userRepository.save(any(User.class))).thenAnswer(call -> call.getArgument(0));

        runner("  Admin@School.Example ", PASSWORD).run(null);

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(saved.capture());
        assertEquals(EMAIL, saved.getValue().getEmail());
        assertFalse(saved.getValue().getEmail().contains(" "));
    }
}
