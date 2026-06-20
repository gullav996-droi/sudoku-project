# Generated for Sudoku tutorial and note-mode persistence.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0004_userprofile_bio'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='gamesession',
            name='notes',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.CreateModel(
            name='LearningProgress',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tutorial_completed', models.BooleanField(default=False)),
                ('current_lesson', models.PositiveSmallIntegerField(default=1)),
                ('completed_lessons', models.JSONField(blank=True, default=list)),
                ('xp', models.PositiveIntegerField(default=0)),
                ('achievements', models.JSONField(blank=True, default=list)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='learning_progress', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
