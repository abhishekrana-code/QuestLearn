package com.questlearn.email;

/**
 * One way of getting an email out of the process.
 *
 * <p>Three implementations exist so the deployment decides, not the code: a
 * transactional-email HTTP API, plain SMTP, or a fallback that writes the message
 * to the server log. {@link #isDeliveryConfigured()} lets the caller tell the
 * operator's log line from a real send.</p>
 */
public interface EmailSender {

    /** Sends, or throws {@link EmailDeliveryException} when the transport refuses. */
    void send(EmailMessage message);

    /**
     * False only for the log fallback. Callers use this to word their log lines
     * honestly ("emailed" versus "written to the log").
     */
    boolean isDeliveryConfigured();

    class EmailDeliveryException extends RuntimeException {
        public EmailDeliveryException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
