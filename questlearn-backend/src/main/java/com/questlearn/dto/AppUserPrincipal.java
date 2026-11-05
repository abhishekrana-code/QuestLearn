package com.questlearn.dto;

import com.questlearn.model.Role;

/**
 * Authenticated principal decoded from the JWT - no database round trip per request.
 */
public record AppUserPrincipal(Long id, String email, Role role) {
}
