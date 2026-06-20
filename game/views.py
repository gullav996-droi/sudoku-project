import json
import calendar
from datetime import timedelta
from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required, user_passes_test
from django.core.files.storage import default_storage
from django.db.models import Avg, Min, Sum
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django.contrib.auth import views as auth_views

from .forms import ProfileForm, SettingsForm, UserLoginForm, UserRegisterForm
from .models import Achievement, DailyChallenge, DailyChallengeCompletion, GameSession, LearningProgress, UserAchievement, UserProfile
from .utils import generate_puzzle_with_solution


LEARNING_LESSONS = [
    {
        'id': 1,
        'title': 'What is Sudoku?',
        'summary': 'Learn the goal: complete a 9x9 grid so every row, column, and box has 1 through 9.',
        'focus': 'Find the missing number by checking which digit has not appeared yet.',
        'practice': {'type': 'single', 'question': 'Which number completes this mini row?', 'answer': '9', 'values': ['1', '2', '3', '4', '5', '6', '7', '8', '']},
    },
    {
        'id': 2,
        'title': 'Understanding rows',
        'summary': 'A row runs left to right. Each row must contain every number 1-9 exactly once.',
        'focus': 'Scan the row and find the missing number.',
        'practice': {'type': 'single', 'question': 'Complete the row using Sudoku rules.', 'answer': '5', 'values': ['1', '2', '3', '4', '', '6', '7', '8', '9']},
    },
    {
        'id': 3,
        'title': 'Understanding columns',
        'summary': 'A column runs top to bottom. Columns follow the same 1-9 no-repeat rule.',
        'focus': 'Read downward and identify the absent digit.',
        'practice': {'type': 'single', 'question': 'Complete the column without repeating a digit.', 'answer': '4', 'values': ['1', '2', '3', '', '5', '6', '7', '8', '9']},
    },
    {
        'id': 4,
        'title': 'Understanding 3x3 boxes',
        'summary': 'Each thick-bordered 3x3 box is also a complete set of 1-9.',
        'focus': 'Use box membership to choose the missing number.',
        'practice': {'type': 'single', 'question': 'Complete the 3x3 box.', 'answer': '8', 'values': ['1', '2', '3', '4', '', '6', '7', '5', '9']},
    },
    {
        'id': 5,
        'title': 'How to find obvious numbers',
        'summary': 'Obvious numbers appear when a row, column, or box has only one legal option left.',
        'focus': 'Combine row and box evidence.',
        'practice': {'type': 'single', 'question': 'Use the visible clues to fill the only open cell.', 'answer': '6', 'values': ['1', '2', '3', '4', '5', '', '7', '8', '9']},
    },
    {
        'id': 6,
        'title': 'Using Note Mode',
        'summary': 'Pencil marks keep possible candidates small until logic proves the final value.',
        'focus': 'Use notes to track possible values before committing to an answer.',
        'practice': {'type': 'multi', 'question': 'Select the two candidates that could remain for the empty cell.', 'answer': ['2', '7'], 'values': ['1', '', '3', '4', '5', '6', '', '8', '9']},
    },
    {
        'id': 7,
        'title': 'Hidden Singles',
        'summary': 'A hidden single is the only place a number can go in a row, column, or box.',
        'focus': 'Look for the cell where one number has only one possible home.',
        'practice': {'type': 'single', 'question': 'Use the candidates to fill the hidden single.', 'answer': '7', 'values': ['1/4', '4/9', '', '2/5', '3/5', '6/8', '1/8', '2/9', '3/6']},
    },
    {
        'id': 8,
        'title': 'Naked Pairs',
        'summary': 'When two cells in a unit contain the same two candidates, those candidates can be removed elsewhere.',
        'focus': 'Spot the pair, remove those candidates from the other cell, then solve.',
        'practice': {'type': 'single', 'question': 'Use the naked pair to decide the empty cell.', 'answer': '8', 'values': ['2/5', '2/5', '', '1/3', '3/4', '4/6', '6/7', '7/9', '1/9']},
    },
    {
        'id': 9,
        'title': 'Scanning techniques',
        'summary': 'Scanning checks rows and columns to narrow where a number can appear inside boxes.',
        'focus': 'Eliminate impossible values until one candidate remains.',
        'practice': {'type': 'single', 'question': 'After scanning the clues, fill the open cell.', 'answer': '4', 'values': ['1/2', '2/3', '3/5', '5/6', '6/7', '', '7/8', '8/9', '1/9']},
    },
    {
        'id': 10,
        'title': 'Expert solving strategies',
        'summary': 'Advanced puzzles use chains, locked candidates, and careful candidate reduction.',
        'focus': 'Apply a final expert deduction.',
        'practice': {'type': 'single', 'question': 'Use the remaining candidates to place the final value.', 'answer': '1', 'values': ['', '3/7', '1/7', '2/8', '4/6', '5/6', '2/5', '4/9', '8/9']},
    },
]

LEARNING_BADGES = [
    {'key': 'beginner', 'title': 'Beginner', 'description': 'Complete your first lesson.'},
    {'key': 'quick-learner', 'title': 'Quick Learner', 'description': 'Complete three lessons.'},
    {'key': 'note-master', 'title': 'Note Master', 'description': 'Complete the note mode lesson.'},
    {'key': 'logic-expert', 'title': 'Logic Expert', 'description': 'Complete eight lessons.'},
    {'key': 'sudoku-master', 'title': 'Sudoku Master', 'description': 'Complete the academy.'},
]


def home(request):
    if request.user.is_authenticated:
        return redirect('user_home')
    recent_games = []
    if request.user.is_authenticated:
        recent_games = GameSession.objects.filter(user=request.user).order_by('-updated_at')[:3]
    return render(request, 'game/home.html', {'recent_games': recent_games})


@login_required(login_url='login')
def user_home(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    return render(request, 'game/user_home.html', {
        'profile': profile,
    })


def register_view(request):
    if request.user.is_authenticated:
        return redirect('user_home')
    form = UserRegisterForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.save()
        UserProfile.objects.create(user=user)
        login(request, user)
        messages.success(request, 'Welcome to Sudoku Pro! Your account has been created.')
        return redirect('user_home')
    return render(request, 'game/auth/register.html', {'form': form})


def login_view(request):
    if request.user.is_authenticated:
        return redirect('user_home')
    form = UserLoginForm(request, data=request.POST or None)
    if request.method == 'POST' and form.is_valid():
        user = form.get_user()
        login(request, user)
        if form.cleaned_data.get('remember_me'):
            request.session.set_expiry(1209600)
        else:
            request.session.set_expiry(0)
        return redirect('user_home')
    return render(request, 'game/auth/login.html', {'form': form})


def logout_view(request):
    logout(request)
    messages.info(request, 'You have been logged out successfully.')
    return redirect('home')


@login_required(login_url='login')
def dashboard(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    completed_sessions = GameSession.objects.filter(user=request.user, status='completed')
    total_games_played = GameSession.objects.filter(user=request.user, status__in=['completed', 'failed']).count()
    games_won = completed_sessions.count()
    win_percentage = round((games_won / total_games_played) * 100) if total_games_played else 0
    fastest_seconds = completed_sessions.aggregate(fastest=Min('elapsed_seconds'))['fastest'] or 0
    average_seconds = completed_sessions.aggregate(avg=Avg('elapsed_seconds'))['avg'] or 0
    total_hints_used = completed_sessions.aggregate(total=Sum('hints_used'))['total'] or 0
    achievements = UserAchievement.objects.filter(user=request.user).select_related('achievement')
    achievements_count = achievements.count()
    recent_games = GameSession.objects.filter(user=request.user).order_by('-updated_at')[:5]
    today = timezone.localdate()
    daily_challenge = DailyChallenge.objects.filter(date=today).first()
    if not daily_challenge:
        puzzle, solution = generate_puzzle_with_solution('medium')
        daily_challenge = DailyChallenge.objects.create(
            date=today,
            difficulty='medium',
            puzzle=puzzle,
            solution=solution,
        )

    daily_completed = False
    latest_daily_completion = None
    completed_dates = set()
    if request.user.is_authenticated:
        today_completion = DailyChallengeCompletion.objects.filter(user=request.user, date=today).first()
        daily_completed = bool(today_completion)
        latest_daily_completion = DailyChallengeCompletion.objects.filter(user=request.user).order_by('-date').first()
        completed_dates = set(DailyChallengeCompletion.objects.filter(user=request.user, date__year=today.year, date__month=today.month).values_list('date', flat=True))

    calendar_month = _build_month_calendar(today.year, today.month, completed_dates, today)
    month_label = today.strftime('%B %Y')
    current_time = timezone.localtime().strftime('%I:%M %p')
    best_streak = 0
    current = 0
    for session in GameSession.objects.filter(user=request.user).order_by('created_at'):
        if session.status == 'completed':
            current += 1
            best_streak = max(best_streak, current)
        else:
            current = 0

    def format_time(seconds):
        if not seconds:
            return '--:--'
        seconds = int(seconds)
        minutes = seconds // 60
        remainder = seconds % 60
        return f'{minutes}:{remainder:02d}'

    return render(request, 'game/dashboard.html', {
        'profile': profile,
        'total_games_played': total_games_played,
        'games_won': games_won,
        'win_percentage': win_percentage,
        'current_streak': profile.win_streak,
        'best_streak': best_streak,
        'daily_streak': profile.daily_streak,
        'fastest_time': format_time(fastest_seconds),
        'average_time': format_time(average_seconds),
        'total_hints_used': total_hints_used,
        'achievements_count': achievements_count,
        'recent_games': recent_games,
        'achievements': achievements[:6],
        'daily_challenge': daily_challenge,
        'daily_completed': daily_completed,
        'latest_daily_completion': latest_daily_completion,
        'calendar_month': calendar_month,
        'month_label': month_label,
        'current_time': current_time,
        'today': today,
        'week_days': ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    })


@login_required(login_url='login')
def profile_view(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    form = ProfileForm(request.POST or None, request.FILES or None, instance=request.user, profile=profile)
    settings_form = SettingsForm(request.POST or None, initial={
        'theme': profile.theme,
        'language': profile.language,
        'sound_enabled': profile.sound_enabled,
        'highlight_duplicates': profile.highlight_duplicates,
        'animation_enabled': profile.animation_enabled,
        'timer_visible': profile.timer_visible,
    })
    if request.method == 'POST':
        if 'remove_photo' in request.POST:
            profile.avatar = ''
            profile.save()
            messages.success(request, 'Profile photo removed successfully.')
            return redirect('profile')
        if 'profile_submit' in request.POST and form.is_valid():
            form.save()
            avatar_upload = form.cleaned_data.get('avatar_upload')
            if avatar_upload:
                avatar_path = default_storage.save(f'avatars/{request.user.id}/{avatar_upload.name}', avatar_upload)
                profile.avatar = default_storage.url(avatar_path)
                profile.save()
            messages.success(request, 'Profile updated successfully.')
            return redirect('profile')
        if 'settings_submit' in request.POST and settings_form.is_valid():
            profile.theme = settings_form.cleaned_data['theme']
            profile.language = settings_form.cleaned_data['language']
            profile.sound_enabled = settings_form.cleaned_data['sound_enabled']
            profile.highlight_duplicates = settings_form.cleaned_data['highlight_duplicates']
            profile.animation_enabled = settings_form.cleaned_data['animation_enabled']
            profile.timer_visible = settings_form.cleaned_data['timer_visible']
            profile.save()
            messages.success(request, 'Settings saved successfully.')
            return redirect('profile')

    completed_sessions = GameSession.objects.filter(user=request.user, status='completed')
    game_history = GameSession.objects.filter(user=request.user).order_by('-updated_at')
    total_games_played = GameSession.objects.filter(user=request.user, status__in=['completed', 'failed']).count()
    games_won = completed_sessions.count()
    win_percentage = round((games_won / total_games_played) * 100) if total_games_played else 0
    fastest_seconds = completed_sessions.aggregate(fastest=Min('elapsed_seconds'))['fastest'] or 0
    average_seconds = completed_sessions.aggregate(avg=Avg('elapsed_seconds'))['avg'] or 0

    best_streak = 0
    current = 0
    for session in GameSession.objects.filter(user=request.user).order_by('created_at'):
        if session.status == 'completed':
            current += 1
            best_streak = max(best_streak, current)
        else:
            current = 0

    daily_completions = DailyChallengeCompletion.objects.filter(user=request.user).count()
    master_solved = completed_sessions.filter(difficulty__in=['expert', 'master']).exists()

    def format_time(seconds):
        if not seconds:
            return '--:--'
        seconds = int(seconds)
        minutes = seconds // 60
        remainder = seconds % 60
        return f'{minutes}:{remainder:02d}'

    earned_achievement_keys = set(
        UserAchievement.objects.filter(user=request.user).values_list('achievement__key', flat=True)
    )
    achievements = [
        {
            'title': 'Beginner',
            'description': 'Started your Sudoku journey.',
            'icon': 'spark',
            'earned': total_games_played > 0 or 'first-win' in earned_achievement_keys,
        },
        {
            'title': 'Speed Solver',
            'description': 'Solved a puzzle in under five minutes.',
            'icon': 'bolt',
            'earned': bool(fastest_seconds and fastest_seconds <= 300) or 'speed-runner' in earned_achievement_keys,
        },
        {
            'title': 'Daily Challenger',
            'description': 'Completed a daily challenge.',
            'icon': 'calendar',
            'earned': daily_completions > 0,
        },
        {
            'title': 'Master Solver',
            'description': 'Completed an expert or master puzzle.',
            'icon': 'crown',
            'earned': master_solved or 'challenge-conqueror' in earned_achievement_keys,
        },
        {
            'title': '7-Day Streak',
            'description': 'Built a week-long daily streak.',
            'icon': 'flame',
            'earned': profile.daily_streak >= 7,
        },
        {
            'title': '30-Day Streak',
            'description': 'Maintained a monthly streak.',
            'icon': 'medal',
            'earned': profile.daily_streak >= 30,
        },
    ]

    display_name = request.user.get_full_name() or request.user.username
    name_parts = display_name.split()
    if len(name_parts) >= 2:
        initials = f'{name_parts[0][0]}{name_parts[-1][0]}'.upper()
    else:
        initials = display_name[:2].upper()

    return render(request, 'game/profile.html', {
        'form': form,
        'settings_form': settings_form,
        'profile': profile,
        'initials': initials,
        'display_name': display_name,
        'total_games_played': total_games_played,
        'games_won': games_won,
        'win_percentage': win_percentage,
        'current_streak': profile.win_streak,
        'best_streak': best_streak,
        'daily_streak': profile.daily_streak,
        'fastest_time': format_time(fastest_seconds),
        'average_time': format_time(average_seconds),
        'profile_achievements': achievements,
        'game_history': game_history,
    })


@login_required(login_url='login')
@require_POST
def delete_game_history_item(request, session_id):
    GameSession.objects.filter(id=session_id, user=request.user).delete()
    messages.success(request, 'Game history item deleted.')
    return redirect('profile')


@login_required(login_url='login')
@require_POST
def delete_all_game_history(request):
    GameSession.objects.filter(user=request.user).delete()
    messages.success(request, 'Game history cleared.')
    return redirect('profile')


@login_required(login_url='login')
def complete_game_session(request):
    if request.method != 'POST':
        return redirect('dashboard')

    try:
        data = json.loads(request.body)
    except ValueError:
        return redirect('dashboard')

    session_id = data.get('session_id')
    if not session_id:
        return redirect('dashboard')

    try:
        session = GameSession.objects.get(id=session_id, user=request.user)
    except GameSession.DoesNotExist:
        return redirect('dashboard')

    if session.status == 'completed':
        return JsonResponse({'status': 'ok'})

    session.progress = data.get('progress', session.progress)
    session.mistakes = data.get('mistakes', session.mistakes)
    session.hints_used = data.get('hints_used', session.hints_used)
    session.elapsed_seconds = data.get('elapsed_seconds', session.elapsed_seconds)
    session.score = data.get('score', session.score)
    session.status = 'completed'
    session.save()

    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    profile.win_streak += 1
    if session.elapsed_seconds and (profile.best_time is None or session.elapsed_seconds < profile.best_time.total_seconds()):
        profile.best_time = timedelta(seconds=session.elapsed_seconds)

    if session.mode == 'daily' and request.user.is_authenticated:
        today = timezone.localdate()
        completion, created = DailyChallengeCompletion.objects.get_or_create(
            user=request.user,
            date=today,
            defaults={
                'elapsed_seconds': session.elapsed_seconds or 0,
                'score': session.score or 0,
                'difficulty': session.difficulty,
            }
        )
        if created:
            if profile.last_daily_completed_date == today - timedelta(days=1):
                profile.daily_streak += 1
            else:
                profile.daily_streak = 1
            profile.last_daily_completed_date = today
            profile.xp += 50
            profile.coins += 25

    profile.save()

    _award_achievements(request.user, session, profile)
    return JsonResponse({'status': 'ok'})


def _award_achievements(user, session, profile):
    achievements_to_check = []
    if GameSession.objects.filter(user=user, status='completed').count() == 1:
        achievements_to_check.append(('first-win', 'First Victory', 'Complete your first Sudoku game.'))
    if profile.win_streak >= 5:
        achievements_to_check.append(('streak-momentum', 'Streak Momentum', 'Win 5 consecutive games.'))
    if session.elapsed_seconds and session.elapsed_seconds <= 300:
        achievements_to_check.append(('speed-runner', 'Speed Runner', 'Solve a puzzle in under five minutes.'))
    if session.difficulty in ['hard', 'master']:
        achievements_to_check.append(('challenge-conqueror', 'Challenge Conqueror', 'Complete a high-difficulty Sudoku.'))

    for key, title, description in achievements_to_check:
        achievement, _ = Achievement.objects.get_or_create(
            key=key,
            defaults={'title': title, 'description': description}
        )
        UserAchievement.objects.get_or_create(user=user, achievement=achievement)


def _build_month_calendar(year, month, completed_dates, today):
    cal = calendar.Calendar(firstweekday=6)
    weeks = []
    for week in cal.monthdatescalendar(year, month):
        week_data = []
        for day in week:
            week_data.append({
                'date': day,
                'day': day.day,
                'in_month': day.month == month,
                'is_today': day == today,
                'completed': day in completed_dates,
                'locked': day > today,
            })
        weeks.append(week_data)
    return weeks


def _get_daily_challenge():
    today = timezone.localdate()
    challenge = DailyChallenge.objects.filter(date=today).first()
    if challenge:
        return challenge.puzzle, challenge.solution, challenge.difficulty

    puzzle, solution = generate_puzzle_with_solution('medium')
    challenge = DailyChallenge.objects.create(
        date=today,
        difficulty='medium',
        puzzle=puzzle,
        solution=solution,
    )
    return challenge.puzzle, challenge.solution, challenge.difficulty


def play_menu(request):
    mode = request.GET.get('mode')
    difficulty = request.GET.get('difficulty')
    if mode or difficulty:
        return play_view(request)
    return render(request, 'game/play_menu.html')


def play_view(request):
    resume_session_id = request.GET.get('session_id')
    if request.user.is_authenticated and resume_session_id:
        session = GameSession.objects.filter(id=resume_session_id, user=request.user).first()
        if session:
            return render(request, 'game/play.html', {
                'mode': session.get_mode_display(),
                'difficulty': session.difficulty.title(),
                'puzzle_json': json.dumps(session.puzzle),
                'solution_json': json.dumps(session.solution),
                'progress_json': json.dumps(session.progress or session.puzzle),
                'notes_json': json.dumps(session.notes or _empty_notes()),
                'session_id': session.id,
                'tutorial_completed': _tutorial_completed(request),
            })

    mode = request.GET.get('mode', 'free')
    difficulty = request.GET.get('difficulty', 'easy')
    if mode == 'daily':
        puzzle, solution, difficulty = _get_daily_challenge()
    else:
        puzzle, solution = generate_puzzle_with_solution(difficulty)

    if mode == 'free':
        mode_label = 'Free Play'
    elif mode == 'daily':
        mode_label = 'Daily Challenge'
    else:
        mode_label = difficulty.title()

    session_id = None
    if request.user.is_authenticated and mode != 'free':
        session = GameSession.objects.create(
            user=request.user,
            mode=mode,
            difficulty=difficulty,
            puzzle=puzzle,
            solution=solution,
            progress=puzzle,
            status='playing',
        )
        session_id = session.id
    elif request.user.is_authenticated and mode == 'free':
        session = GameSession.objects.create(
            user=request.user,
            mode=mode,
            difficulty=difficulty,
            puzzle=puzzle,
            solution=solution,
            progress=puzzle,
            status='playing',
        )
        session_id = session.id

    return render(request, 'game/play.html', {
        'mode': mode_label,
        'difficulty': difficulty.title(),
        'puzzle_json': json.dumps(puzzle),
        'solution_json': json.dumps(solution),
        'progress_json': json.dumps(puzzle),
        'notes_json': json.dumps(_empty_notes()),
        'session_id': session_id,
        'tutorial_completed': _tutorial_completed(request),
    })


def settings_view(request):
    return redirect('profile')


@ensure_csrf_cookie
def learning_view(request):
    progress = _get_learning_progress(request)
    completed = progress['completed_lessons']
    percent = round((len(completed) / len(LEARNING_LESSONS)) * 100)
    lessons = []
    for lesson in LEARNING_LESSONS:
        lesson = lesson.copy()
        lesson['completed'] = lesson['id'] in completed
        lesson['locked'] = lesson['id'] > max(progress['current_lesson'], 1)
        lessons.append(lesson)

    return render(request, 'game/learning.html', {
        'lessons': lessons,
        'lessons_json': json.dumps(LEARNING_LESSONS),
        'badges': LEARNING_BADGES,
        'progress': progress,
        'percent_complete': percent,
    })


@require_POST
def save_game_session(request):
    if not request.user.is_authenticated:
        return JsonResponse({'status': 'anonymous'})
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)

    session = GameSession.objects.filter(id=data.get('session_id'), user=request.user).first()
    if not session:
        return JsonResponse({'status': 'error', 'message': 'Session not found'}, status=404)

    session.progress = data.get('progress', session.progress)
    session.notes = data.get('notes', session.notes)
    session.mistakes = data.get('mistakes', session.mistakes)
    session.hints_used = data.get('hints_used', session.hints_used)
    session.elapsed_seconds = data.get('elapsed_seconds', session.elapsed_seconds)
    session.score = data.get('score', session.score)
    if session.status == 'new':
        session.status = 'playing'
    session.save()
    return JsonResponse({'status': 'ok'})


@require_POST
def complete_tutorial(request):
    if request.user.is_authenticated:
        progress, _ = LearningProgress.objects.get_or_create(user=request.user)
        progress.tutorial_completed = True
        progress.save(update_fields=['tutorial_completed', 'updated_at'])
    return JsonResponse({'status': 'ok'})


@require_POST
def complete_lesson(request):
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({'status': 'error', 'message': 'Invalid JSON'}, status=400)

    lesson_id = int(data.get('lesson_id', 0))
    if lesson_id < 1 or lesson_id > len(LEARNING_LESSONS):
        return JsonResponse({'status': 'error', 'message': 'Unknown lesson'}, status=400)

    if not request.user.is_authenticated:
        completed_before = set(int(item) for item in data.get('completed_lessons', []))
        if lesson_id > (max(completed_before) + 1 if completed_before else 1):
            return JsonResponse({'status': 'error', 'message': 'Complete earlier lessons first.'}, status=409)
        completed = sorted(completed_before | {lesson_id})
        return JsonResponse(_learning_payload(
            completed,
            max(completed) + 1 if completed else 1,
            len(completed) * 50,
            _learning_achievements(completed),
        ))

    progress, _ = LearningProgress.objects.get_or_create(user=request.user)
    completed = set(int(item) for item in progress.completed_lessons)
    if lesson_id > max(progress.current_lesson, 1):
        return JsonResponse({'status': 'error', 'message': 'Complete earlier lessons first.'}, status=409)
    before = len(completed)
    completed.add(lesson_id)
    progress.completed_lessons = sorted(completed)
    progress.current_lesson = min(len(LEARNING_LESSONS), max(progress.current_lesson, lesson_id + 1))
    if len(completed) > before:
        progress.xp += 50
    progress.achievements = _learning_achievements(progress.completed_lessons)
    progress.save()
    return JsonResponse(_learning_payload(progress.completed_lessons, progress.current_lesson, progress.xp, progress.achievements))


def _empty_notes():
    return [[] for _ in range(81)]


def _tutorial_completed(request):
    if request.user.is_authenticated:
        progress, _ = LearningProgress.objects.get_or_create(user=request.user)
        return progress.tutorial_completed
    return False


def _get_learning_progress(request):
    if request.user.is_authenticated:
        progress, _ = LearningProgress.objects.get_or_create(user=request.user)
        progress.achievements = _learning_achievements(progress.completed_lessons)
        progress.save(update_fields=['achievements', 'updated_at'])
        return {
            'tutorial_completed': progress.tutorial_completed,
            'current_lesson': progress.current_lesson,
            'completed_lessons': progress.completed_lessons,
            'xp': progress.xp,
            'achievements': progress.achievements,
        }
    return {
        'tutorial_completed': False,
        'current_lesson': 1,
        'completed_lessons': [],
        'xp': 0,
        'achievements': [],
    }


def _learning_achievements(completed_lessons):
    completed = set(int(item) for item in completed_lessons)
    earned = []
    if completed:
        earned.append('beginner')
    if len(completed) >= 3:
        earned.append('quick-learner')
    if 6 in completed:
        earned.append('note-master')
    if len(completed) >= 8:
        earned.append('logic-expert')
    if len(completed) >= len(LEARNING_LESSONS):
        earned.append('sudoku-master')
    return earned


def _learning_payload(completed, current_lesson, xp, achievements=None):
    achievements = achievements if achievements is not None else _learning_achievements(completed)
    return {
        'status': 'ok',
        'completed_lessons': completed,
        'current_lesson': min(len(LEARNING_LESSONS), current_lesson),
        'percent': round((len(completed) / len(LEARNING_LESSONS)) * 100),
        'xp': xp,
        'achievements': achievements,
    }
