package com.questlearn.dto;

/**
 * The one and only time the rotated demo password is readable.
 *
 * @param password the new shared password, shown once and never stored in clear
 * @param accounts how many demo accounts were updated to it
 */
public record DemoPasswordRotation(String password, int accounts) {
}
