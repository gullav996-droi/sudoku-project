from django.contrib import admin

from .models import Achievement, DailyChallenge, DailyChallengeCompletion, GameSession, UserAchievement, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'theme', 'language', 'xp', 'coins', 'stars', 'win_streak')
    search_fields = ('user__username', 'user__email')


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ('user', 'difficulty', 'mode', 'status', 'score', 'mistakes', 'updated_at')
    list_filter = ('difficulty', 'mode', 'status')
    search_fields = ('user__username',)


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ('title', 'key', 'reward_xp', 'reward_coins')
    search_fields = ('title', 'key')


@admin.register(UserAchievement)
class UserAchievementAdmin(admin.ModelAdmin):
    list_display = ('user', 'achievement', 'earned_at')
    search_fields = ('user__username', 'achievement__title')


@admin.register(DailyChallenge)
class DailyChallengeAdmin(admin.ModelAdmin):
    list_display = ('date', 'difficulty', 'created_at')
    
    ordering = ('-date',)


@admin.register(DailyChallengeCompletion)
class DailyChallengeCompletionAdmin(admin.ModelAdmin):
    list_display = ('user', 'date', 'difficulty', 'score', 'elapsed_seconds', 'completed_at')
    list_filter = ('difficulty', 'date')
    search_fields = ('user__username',)
