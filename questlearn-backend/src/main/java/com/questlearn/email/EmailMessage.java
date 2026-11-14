package com.questlearn.email;

/**
 * One outbound transactional email, independent of the transport that sends it.
 */
public record EmailMessage(
        String from,
        String to,
        String subject,
        String text,
        String html
) {
}
