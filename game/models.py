from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    avatar = models.URLField(blank=True)
    bio = models.TextField(blank=True)
    theme = models.CharField(max_length=20, default='light')
    language = models.CharField(max_length=10, default='en')
    sound_enabled = models.BooleanField(default=True)
    highlight_duplicates = models.BooleanField(default=True)
    animation_enabled = models.BooleanField(default=True)
    timer_visible = models.BooleanField(default=True)
    xp = models.PositiveIntegerField(default=0)
    coins = models.PositiveIntegerField(default=0)
    stars = models.PositiveSmallIntegerField(default=0)
    win_streak = models.PositiveIntegerField(default=0)
    daily_streak = models.PositiveIntegerField(default=0)
    last_daily_completed_date = models.DateField(null=True, blank=True)
    best_time = models.DurationField(null=True, blank=True)
    last_reward_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.user.username} Profile'


class GameSession(models.Model):
    MODE_CHOICES = [
        ('free', 'Free Play'),
        ('random', 'Random Puzzle'),
        ('daily', 'Daily Challenge'),
        ('custom', 'Custom Puzzle'),
        ('practice', 'Practice Mode'),
        ('story', 'Story Mode'),
    ]

    DIFFICULTY_CHOICES = [
        ('easy', 'Easy'),
        ('medium', 'Medium'),
        ('hard', 'Hard'),
        ('expert', 'Expert'),
        ('master', 'Master'),
    ]

    STATUS_CHOICES = [
        ('new', 'New'),
        ('playing', 'Playing'),
        ('paused', 'Paused'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='game_sessions')
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='random')
    difficulty = models.CharField(max_length=10, choices=DIFFICULTY_CHOICES, default='medium')
    puzzle = models.JSONField(default=list)
    solution = models.JSONField(default=list)
    progress = models.JSONField(default=list)
    notes = models.JSONField(default=list, blank=True)
    mistakes = models.PositiveIntegerField(default=0)
    hints_used = models.PositiveIntegerField(default=0)
    elapsed_seconds = models.PositiveIntegerField(default=0)
    score = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.user.username} | {self.difficulty.title()} | {self.get_status_display()}'

    def completion_percentage(self):
        if not self.progress:
            return 0
        filled = sum(1 for value in self.progress if value)
        return round((filled / 81) * 100)


class Achievement(models.Model):
    key = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    reward_xp = models.PositiveIntegerField(default=50)
    reward_coins = models.PositiveIntegerField(default=25)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class UserAchievement(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='achievements')
    achievement = models.ForeignKey(Achievement, on_delete=models.CASCADE, related_name='earned_by')
    earned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'achievement')

    def __str__(self):
        return f'{self.user.username} - {self.achievement.title}'


class DailyChallenge(models.Model):
    date = models.DateField(unique=True)
    puzzle = models.JSONField(default=list)
    solution = models.JSONField(default=list)
    difficulty = models.CharField(max_length=10, choices=GameSession.DIFFICULTY_CHOICES, default='expert')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Daily Challenge {self.date} ({self.difficulty.title()})'


class DailyChallengeCompletion(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='daily_completions')
    date = models.DateField()
    completed_at = models.DateTimeField(auto_now_add=True)
    elapsed_seconds = models.PositiveIntegerField(default=0)
    score = models.PositiveIntegerField(default=0)
    difficulty = models.CharField(max_length=10, choices=GameSession.DIFFICULTY_CHOICES, default='medium')

    class Meta:
        unique_together = ('user', 'date')
        ordering = ['-date']

    def __str__(self):
        return f'{self.user.username} completed Daily Challenge {self.date}'


class LearningProgress(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learning_progress')
    tutorial_completed = models.BooleanField(default=False)
    current_lesson = models.PositiveSmallIntegerField(default=1)
    completed_lessons = models.JSONField(default=list, blank=True)
    xp = models.PositiveIntegerField(default=0)
    achievements = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.user.username} Learning Progress'
