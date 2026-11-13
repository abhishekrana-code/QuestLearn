package com.questlearn.dto;

import java.util.List;

/**
 * A class list pasted in from a spreadsheet.
 *
 * <p>Only addresses are accepted: the college already knows the names, and an
 * import that silently created accounts would need a password nobody could deliver
 * while there is no email transport.</p>
 */
public record ImportRosterRequest(List<String> emails, Long cohortId) {
}
