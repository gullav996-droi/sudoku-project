from django.contrib.auth import views as auth_views    # Import Django's built-in authentication views
from django.urls import path, reverse_lazy    #path is used in this line for url connect  and reverse_lazy is used for generate name based urls. 

from . import views    #. is represent the currect folder and import the views.py file from the current folder which is game app

urlpatterns = [
    path('', views.home, name='home'),
    path('register/', views.register_view, name='register'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('home/', views.user_home, name='user_home'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('profile/', views.profile_view, name='profile'),
    path('play/', views.play_menu, name='play'),
    path('play-menu/', views.play_menu, name='play_menu'),
    path('play/start/', views.play_view, name='play_start'),
    path('learning/', views.learning_view, name='learning'),
    path('save-game-session/', views.save_game_session, name='save_game_session'),
    path('complete-game-session/', views.complete_game_session, name='complete_game_session'),
    path('tutorial/complete/', views.complete_tutorial, name='complete_tutorial'),
    path('learning/complete-lesson/', views.complete_lesson, name='complete_lesson'),
    path('history/<int:session_id>/delete/', views.delete_game_history_item, name='delete_game_history_item'),
    path('history/delete-all/', views.delete_all_game_history, name='delete_all_game_history'),
    path('settings/', views.settings_view, name='settings'),
    path('password-change/', auth_views.PasswordChangeView.as_view(
        template_name='game/auth/password_reset_form.html',
        success_url=reverse_lazy('profile')
    ), name='password_change'),
    path('password-reset/', auth_views.PasswordResetView.as_view(
        template_name='game/auth/password_reset_form.html',
        email_template_name='game/auth/password_reset_email.html',
        success_url=reverse_lazy('password_reset_done')
    ), name='password_reset'),
    path('password-reset/done/', auth_views.PasswordResetDoneView.as_view(
        template_name='game/auth/password_reset_done.html'
    ), name='password_reset_done'),
    path('password-reset-confirm/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='game/auth/password_reset_confirm.html',
        success_url=reverse_lazy('password_reset_complete')
    ), name='password_reset_confirm'),
    path('password-reset-complete/', auth_views.PasswordResetCompleteView.as_view(
        template_name='game/auth/password_reset_complete.html'
    ), name='password_reset_complete'),
]
