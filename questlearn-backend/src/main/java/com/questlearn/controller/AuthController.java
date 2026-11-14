package com.questlearn.controller;

import com.questlearn.dto.AppUserPrincipal;
import com.questlearn.dto.AuthResponse;
import com.questlearn.dto.ChangePasswordRequest;
import com.questlearn.dto.LoginRequest;
import com.questlearn.dto.PasswordResetConfirmRequest;
import com.questlearn.dto.PasswordResetRequest;
import com.questlearn.dto.RegisterRequest;
import com.questlearn.dto.UserDto;
import com.questlearn.dto.VerifyEmailRequest;
import com.questlearn.service.AuthService;
import com.questlearn.service.EmailVerificationService;
import com.questlearn.service.PasswordResetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "Registration, login and profile")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;
    private final EmailVerificationService emailVerificationService;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a Student or Instructor account")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    @Operation(summary = "Exchange credentials for a JWT")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    @Operation(summary = "Current user profile with live XP, level and streak")
    public UserDto me(@AuthenticationPrincipal AppUserPrincipal principal) {
        return authService.currentUser(principal);
    }

    /**
     * Step one of recovery. Always the same answer, whether or not the address has
     * an account, so this endpoint cannot be used to enumerate registered emails.
     */
    @PostMapping("/password-reset/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Request a single-use password reset link")
    public Map<String, String> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        passwordResetService.request(request.email());
        return Map.of("message",
                "If that email belongs to an account, a reset link is on its way. "
                        + "It expires in " + passwordResetService.tokenTtlMinutes()
                        + " minutes and can be used once.");
    }

    /** Step two: redeem the token and set a new password. Signs other sessions out. */
    @PostMapping("/password-reset/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Set a new password using a reset token")
    public void confirmPasswordReset(@Valid @RequestBody PasswordResetConfirmRequest request) {
        passwordResetService.confirm(request.token(), request.password());
    }

    /**
     * Redeems an address-confirmation link. Public because the link may be opened
     * in a browser that is not signed in; possession of the token is the proof.
     */
    @PostMapping("/verify-email")
    @Operation(summary = "Confirm an email address using the link token")
    public Map<String, String> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        emailVerificationService.verify(request.token());
        return Map.of("message", "Email confirmed. Your account is fully set up.");
    }

    /**
     * Sends a fresh confirmation link to the signed-in account. Only an unconfirmed
     * address may ask, and the per-account throttle keeps an inbox from being flooded.
     */
    @PostMapping("/verify-email/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Resend the confirmation link to your own address")
    public Map<String, String> resendEmailVerification(
            @AuthenticationPrincipal AppUserPrincipal principal) {
        emailVerificationService.resend(principal);
        return Map.of("message", "A new confirmation link is on its way. It expires in "
                + emailVerificationService.tokenTtlHours() + " hours.");
    }

    @PatchMapping("/password")
    @Operation(summary = "Change your own password and receive a fresh token")
    public AuthResponse changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                       @AuthenticationPrincipal AppUserPrincipal principal) {
        return authService.changePassword(principal, request);
    }
}
