package com.questlearn;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

/**
 * QuestLearn - gamified, RPG-style Learning Management System.
 *
 * <p>{@link UserDetailsServiceAutoConfiguration} is excluded because authentication is handled
 * entirely by the stateless JWT filter; without the exclusion Spring Boot would also create an
 * unused in-memory user and print a generated password at startup.</p>
 */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class QuestLearnApplication {

    public static void main(String[] args) {
        SpringApplication.run(QuestLearnApplication.class, args);
    }
}
