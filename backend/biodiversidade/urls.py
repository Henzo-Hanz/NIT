from django.urls import path

from biodiversidade import views

urlpatterns = [
    path('especies/', views.especies, name='especies'),
    path('especies/<slug:slug>/', views.especie, name='especie'),
    path('geometrias/', views.geometrias, name='geometrias'),
]
