package com.questlearn.dto;

/**
 * One of the accounts that share the demo password.
 *
 * @param name  the seeded display name, so an operator can tell the five apart
 * @param email the sign-in address
 * @param role  STUDENT, INSTRUCTOR or ADMIN
 */
public record DemoAccountSummary(String name, String email, String role) {
}
