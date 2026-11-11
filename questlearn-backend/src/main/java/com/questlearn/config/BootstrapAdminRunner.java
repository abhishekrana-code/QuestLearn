package com.questlearn.config;

import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the first real administrator on a production deployment.
 *
 * <p>The demo seeder is gated out of {@code prod}, so a fresh production database
 * has no accounts. This runner reads {@code BOOTSTRAP_ADMIN_EMAIL},
 * {@code BOOTSTRAP_ADMIN_NAME} and {@code BOOTSTRAP_ADMIN_PASSWORD} once and
 * creates the account only when no administrator exists yet. Restarting is safe,
 * and the password variable can be removed after the first successful start.</p>
 *
 * <p>Failures are loud on purpose: an email without a usable password is a
 * configuration mistake, and booting silently without any admin would leave the
 * deployment unadministerable.</p>
 */
@Component
@Profile("prod")
public class BootstrapAdminRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapAdminRunner.class);

    /** Short passwords are rejected rather than stored. */
    static final int MIN_PASSWORD_LENGTH = 12;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String name;
    private final String password;

    public BootstrapAdminRunner(UserRepository userRepository,
                                PasswordEncoder passwordEncoder,
                                @Value("${questlearn.bootstrap.admin-email:}") String email,
                                @Value("${questlearn.bootstrap.admin-name:Administrator}") String name,
                                @Value("${questlearn.bootstrap.admin-password:}") String password) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.email = email == null ? "" : email.trim();
        this.name = name == null || name.isBlank() ? "Administrator" : name.trim();
        this.password = password == null ? "" : password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (userRepository.countByRole(Role.ADMIN) > 0) {
            return;
        }
        if (email.isEmpty() && password.isEmpty()) {
            log.warn("No admin account exists and BOOTSTRAP_ADMIN_EMAIL/PASSWORD are unset; "
                    + "set both and restart to create the first administrator.");
            return;
        }
        if (email.isEmpty() || password.isEmpty()) {
            throw new IllegalStateException(
                    "Both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set to create "
                            + "the first administrator.");
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_PASSWORD must be at least "
                    + MIN_PASSWORD_LENGTH + " characters.");
        }

        String normalisedEmail = email.toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(normalisedEmail)) {
            throw new IllegalStateException("A non-admin account already uses " + normalisedEmail
                    + "; choose a different BOOTSTRAP_ADMIN_EMAIL or promote that account.");
        }

        userRepository.save(User.builder()
                .name(name)
                .email(normalisedEmail)
                .passwordHash(passwordEncoder.encode(password))
                .role(Role.ADMIN)
                .totalXp(0)
                .currentLevel(1)
                .streakDays(0)
                .build());

        // The password itself is never logged.
        log.info("Bootstrap admin created: {}", normalisedEmail);
    }
}
