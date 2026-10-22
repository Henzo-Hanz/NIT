from django.urls import path

from core import views

urlpatterns = [
    path('ping/', views.ping, name='ping'),
]
