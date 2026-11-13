package com.questlearn.dto;

import java.util.List;

/**
 * What a roster import actually did, row by row.
 *
 * <p>Three lists rather than one count: a teacher pasting forty emails needs to know
 * which addresses were joined, which were already there, and which belong to nobody
 * on the platform, because the last group is the work left over.</p>
 */
public record RosterImportResult(
        List<String> imported,
        List<String> alreadyMember,
        List<String> unknown
) {
}
