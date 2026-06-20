import json

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from .views import LEARNING_LESSONS
from .models import GameSession, LearningProgress


@override_settings(ALLOWED_HOSTS=['testserver', 'localhost'])
class LearningSystemTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='player', password='pass12345')

    def test_learning_page_renders(self):
        response = self.client.get(reverse('learning'), HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Sudoku Academy')
        self.assertContains(response, 'data-practice-board')
        self.assertContains(response, 'data-practice-options')
        self.assertContains(response, 'data-check-practice')
        self.assertContains(response, 'data-next-lesson')
        self.assertNotContains(response, 'data-practice-input')
        self.assertNotContains(response, 'Your answer')
        self.assertNotContains(response, 'Fill the only empty cell with 9')

    def test_all_lessons_have_interactive_practice_data(self):
        for lesson in LEARNING_LESSONS:
            with self.subTest(lesson=lesson['id']):
                practice = lesson.get('practice', {})
                self.assertIn(practice.get('type'), {'single', 'multi'})
                self.assertTrue(practice.get('question'))
                self.assertTrue(practice.get('values'))
                self.assertTrue(practice.get('answer'))
                self.assertIn('', practice['values'])
                if practice['type'] == 'single':
                    self.assertIsInstance(practice['answer'], str)
                else:
                    self.assertGreaterEqual(len(practice['answer']), 2)

    def test_lesson_completion_persists_for_logged_in_user(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('complete_lesson'),
            data=json.dumps({'lesson_id': 1}),
            content_type='application/json',
            HTTP_HOST='localhost',
        )
        self.assertEqual(response.status_code, 200)
        progress = LearningProgress.objects.get(user=self.user)
        self.assertEqual(progress.completed_lessons, [1])
        self.assertEqual(progress.xp, 50)
        self.assertIn('beginner', progress.achievements)

    def test_lesson_completion_does_not_award_duplicate_xp(self):
        self.client.force_login(self.user)
        for _ in range(2):
            response = self.client.post(
                reverse('complete_lesson'),
                data=json.dumps({'lesson_id': 1}),
                content_type='application/json',
                HTTP_HOST='localhost',
            )
            self.assertEqual(response.status_code, 200)
        progress = LearningProgress.objects.get(user=self.user)
        self.assertEqual(progress.completed_lessons, [1])
        self.assertEqual(progress.xp, 50)

    def test_future_lesson_completion_is_rejected(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('complete_lesson'),
            data=json.dumps({'lesson_id': 3}),
            content_type='application/json',
            HTTP_HOST='localhost',
        )
        self.assertEqual(response.status_code, 409)
        progress = LearningProgress.objects.get(user=self.user)
        self.assertEqual(progress.completed_lessons, [])

    def test_complete_all_lessons_in_order_unlocks_academy(self):
        self.client.force_login(self.user)
        for lesson in LEARNING_LESSONS:
            response = self.client.post(
                reverse('complete_lesson'),
                data=json.dumps({'lesson_id': lesson['id']}),
                content_type='application/json',
                HTTP_HOST='localhost',
            )
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertEqual(payload['status'], 'ok')
            self.assertIn(lesson['id'], payload['completed_lessons'])

        progress = LearningProgress.objects.get(user=self.user)
        self.assertEqual(progress.completed_lessons, [lesson['id'] for lesson in LEARNING_LESSONS])
        self.assertEqual(progress.current_lesson, LEARNING_LESSONS[-1]['id'])
        self.assertEqual(progress.xp, len(LEARNING_LESSONS) * 50)
        self.assertIn('sudoku-master', progress.achievements)

    def test_tutorial_completion_persists_for_logged_in_user(self):
        self.client.force_login(self.user)
        response = self.client.post(reverse('complete_tutorial'), HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(LearningProgress.objects.get(user=self.user).tutorial_completed)

    def test_game_session_save_persists_notes(self):
        self.client.force_login(self.user)
        session = GameSession.objects.create(
            user=self.user,
            mode='free',
            difficulty='easy',
            puzzle=[0] * 81,
            solution=[1] * 81,
            progress=[0] * 81,
            notes=[[] for _ in range(81)],
            status='playing',
        )
        notes = [[] for _ in range(81)]
        notes[0] = [1, 3, 5]
        response = self.client.post(
            reverse('save_game_session'),
            data=json.dumps({'session_id': session.id, 'progress': [0] * 81, 'notes': notes}),
            content_type='application/json',
            HTTP_HOST='localhost',
        )
        self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        self.assertEqual(session.notes[0], [1, 3, 5])
