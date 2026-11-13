package com.questlearn.security;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.model.Role;
import com.questlearn.model.User;
import com.questlearn.repository.UserRepository;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    /**
     * Resolves the account on every authenticated request instead of trusting the
     * claims alone. That one lookup buys two things a stateless token cannot give:
     * a password change or admin reset revokes existing sessions (the {@code tv}
     * claim must match the stored token version), and a role change takes effect
     * on the next request rather than the next sign-in.
     */
    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")
                && SecurityContextHolder.getContext().getAuthentication() == null) {

            Claims claims = jwtUtil.parse(header.substring(7).trim());
            Long userId = claims == null ? null : userIdOf(claims);
            if (userId != null) {
                int tokenVersion = claims.get("tv", Number.class) == null
                        ? 0
                        : claims.get("tv", Number.class).intValue();
                userRepository.findById(userId)
                        .filter(user -> user.getTokenVersion() == tokenVersion)
                        .ifPresent(user -> authenticate(request, user));
            }
        }

        filterChain.doFilter(request, response);
    }

    private Long userIdOf(Claims claims) {
        Number id = claims.get("userId", Number.class);
        return id == null ? null : id.longValue();
    }

    private void authenticate(HttpServletRequest request, User user) {
        Role role = user.getRole();
        AppUserPrincipal principal = new AppUserPrincipal(user.getId(), user.getEmail(), role);
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                        principal, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role.name())));
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
