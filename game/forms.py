from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm

User = get_user_model()


difficulty_choices = [
    ('easy', 'Easy'),
    ('medium', 'Medium'),
    ('hard', 'Hard'),
    ('expert', 'Expert'),
    ('master', 'Master'),
]


class UserRegisterForm(UserCreationForm):
    email = forms.EmailField(required=True, label='Email Address')
    first_name = forms.CharField(required=False, max_length=30, label='First Name')
    last_name = forms.CharField(required=False, max_length=30, label='Last Name')

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password1', 'password2']


class UserLoginForm(AuthenticationForm):
    remember_me = forms.BooleanField(required=False, initial=False, label='Remember Me')


class ProfileForm(forms.ModelForm):
    bio = forms.CharField(required=False, label='About Me', widget=forms.Textarea(attrs={'rows': 4}))
    avatar_upload = forms.FileField(required=False, label='Profile Photo')

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']

    def __init__(self, *args, profile=None, **kwargs):
        self.profile = profile
        super().__init__(*args, **kwargs)
        if profile:
            self.fields['bio'].initial = profile.bio

        field_classes = {
            'first_name': 'profile-input',
            'last_name': 'profile-input',
            'email': 'profile-input',
            'bio': 'profile-input profile-textarea',
            'avatar_upload': 'visually-hidden',
        }
        placeholders = {
            'first_name': 'Add your first name',
            'last_name': 'Add your last name',
            'email': 'name@example.com',
            'bio': 'Share a short note about your Sudoku style...',
        }
        for name, css_class in field_classes.items():
            self.fields[name].widget.attrs.update({
                'class': css_class,
                'data-profile-field': 'true',
                'placeholder': placeholders.get(name, ''),
            })

        self.fields['avatar_upload'].widget.attrs.update({
            'accept': 'image/*',
            'id': 'avatarUpload',
        })

    def save(self, commit=True):
        user = super().save(commit=commit)
        if self.profile:
            self.profile.bio = self.cleaned_data.get('bio', '')
            if commit:
                self.profile.save()
        return user


class SettingsForm(forms.Form):
    theme = forms.ChoiceField(
        choices=[
            ('light', 'Light'),
            ('dark', 'Dark'),
            ('amoled', 'AMOLED'),
            ('blue', 'Blue'),
            ('green', 'Green'),
            ('purple', 'Purple'),
            ('contrast', 'High Contrast'),
        ],
        required=True,
        label='Theme',
    )
    language = forms.ChoiceField(
        choices=[('en', 'English'), ('es', 'Español'), ('fr', 'Français')],
        required=True,
        label='Language',
    )
    sound_enabled = forms.BooleanField(required=False, label='Enable Sound')
    highlight_duplicates = forms.BooleanField(required=False, label='Highlight Duplicates')
    animation_enabled = forms.BooleanField(required=False, label='Smooth Animations')
    timer_visible = forms.BooleanField(required=False, label='Timer Visible')
