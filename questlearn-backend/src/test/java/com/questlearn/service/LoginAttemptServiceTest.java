package com.questlearn.service;

import com.questlearn.exception.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LoginAttemptServiceTest {

    @Test
    void lockingHappensOnlyAfterTheConfiguredFailureCount() {
        LoginAttemptService service = new LoginAttemptService(3, 15);

        service.recordFailure("leo@questlearn.dev");
        service.recordFailure("leo@questlearn.dev");
        assertDoesNotThrow(() -> service.assertNotLocked("leo@questlearn.dev"),
                "two failures must not lock the account");

        service.recordFailure("leo@questlearn.dev");
        ApiException locked = assertThrows(ApiException.class,
                () -> service.assertNotLocked("leo@questlearn.dev"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, locked.getStatus());
    }

    @Test
    void aSuccessfulSignInClearsTheCounter() {
        LoginAttemptService service = new LoginAttemptService(3, 15);

        service.recordFailure("leo@questlearn.dev");
        service.recordFailure("leo@questlearn.dev");
        service.recordSuccess("leo@questlearn.dev");

        service.recordFailure("leo@questlearn.dev");
        service.recordFailure("leo@questlearn.dev");
        assertDoesNotThrow(() -> service.assertNotLocked("leo@questlearn.dev"));
    }

    @Test
    void lockoutIsPerAccountAndCaseInsensitive() {
        LoginAttemptService service = new LoginAttemptService(2, 15);

        service.recordFailure("Leo@QuestLearn.dev");
        service.recordFailure("leo@questlearn.dev");

        assertThrows(ApiException.class, () -> service.assertNotLocked("LEO@questlearn.dev"));
        assertDoesNotThrow(() -> service.assertNotLocked("mira@questlearn.dev"),
                "one account locking must not lock anybody else");
    }

    @Test
    void unknownAccountsAreNotLocked() {
        LoginAttemptService service = new LoginAttemptService(2, 15);
        assertDoesNotThrow(() -> service.assertNotLocked("nobody@questlearn.dev"));
    }
}
