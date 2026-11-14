package com.questlearn.mapper;

import com.questlearn.dto.UserDto;
import com.questlearn.model.User;
import com.questlearn.service.GamificationService;

public final class DtoMapper {

    private DtoMapper() {
    }

    public static UserDto toUserDto(User user) {
        return new UserDto(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.isEmailVerified(),
                user.getTotalXp(),
                user.getCurrentLevel(),
                user.getStreakDays(),
                user.getLastActivityDate(),
                GamificationService.xpForNextLevel(user.getCurrentLevel())
        );
    }
}
