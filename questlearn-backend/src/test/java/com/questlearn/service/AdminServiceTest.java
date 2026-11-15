package com.questlearn.service;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.exception.ApiException;
import com.questlearn.model.Course;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.CourseRepository;
import com.questlearn.repository.ModuleAttemptRepository;
import com.questlearn.repository.ModuleRepository;
import com.questlearn.repository.UserModuleProgressRepository;
import com.questlearn.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final CourseRepository courseRepository = mock(CourseRepository.class);
    private final ModuleRepository moduleRepository = mock(ModuleRepository.class);
    private final UserModuleProgressRepository progressRepository = mock(UserModuleProgressRepository.class);
    private final ModuleAttemptRepository attemptRepository = mock(ModuleAttemptRepository.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private final AuditService auditService = mock(AuditService.class);

    private final AdminService service = new AdminService(userRepository, courseRepository,
            moduleRepository, progressRepository, attemptRepository, passwordEncoder, auditService);

    private final AppUserPrincipal admin = new AppUserPrincipal(1L, "admin@example.com", Role.ADMIN);

    @Test
    void refusesToDeleteTheAdminWhoIsAsking() {
        ApiException error = assertThrows(ApiException.class,
                () -> service.deleteUser(1L, admin));

        assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error.getMessage()).contains("cannot delete your own account");
        verify(userRepository, never()).delete(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void refusesToDeleteTheLastAdmin() {
        User otherAdmin = user(2L, "only-admin@example.com", Role.ADMIN);
        when(userRepository.findById(2L)).thenReturn(Optional.of(otherAdmin));
        when(userRepository.countByRole(Role.ADMIN)).thenReturn(1L);

        ApiException error = assertThrows(ApiException.class,
                () -> service.deleteUser(2L, admin));

        assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error.getMessage()).contains("last admin");
        verify(userRepository, never()).delete(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void refusesAnInstructorWhoStillOwnsCourses() {
        User instructor = user(3L, "teacher@example.com", Role.INSTRUCTOR);
        when(userRepository.findById(3L)).thenReturn(Optional.of(instructor));
        when(courseRepository.findByInstructorIdOrderByIdAsc(3L))
                .thenReturn(List.of(Course.builder().id(9L).title("Owned").build()));

        ApiException error = assertThrows(ApiException.class,
                () -> service.deleteUser(3L, admin));

        assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(error.getMessage()).contains("courses");
        verify(userRepository, never()).delete(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void deletesWorkBeforeTheAccountAndRecordsIt() {
        User student = user(4L, "gone@example.com", Role.STUDENT);
        when(userRepository.findById(4L)).thenReturn(Optional.of(student));
        when(courseRepository.findByInstructorIdOrderByIdAsc(4L)).thenReturn(List.of());

        service.deleteUser(4L, admin);

        // Progress and attempts have no cascade in the schema, so they must go first
        // or the delete fails on a foreign key.
        var order = org.mockito.Mockito.inOrder(attemptRepository, progressRepository, userRepository);
        order.verify(attemptRepository).deleteByUserId(4L);
        order.verify(progressRepository).deleteByUserId(4L);
        order.verify(userRepository).delete(student);
        verify(auditService).record(admin, "user.deleted", "gone@example.com",
                "Account deleted: Gone (STUDENT)");
    }

    @Test
    void reportsAnUnknownAccount() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class,
                () -> service.deleteUser(99L, admin));

        assertThat(error.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    private User user(Long id, String email, Role role) {
        return User.builder()
                .id(id)
                .name("Gone")
                .email(email)
                .role(role)
                .passwordHash("hash")
                .build();
    }
}
