from django.urls import path

from biodiversidade import views

urlpatterns = [
    path('especies/', views.especies, name='especies'),
    path('especies/<slug:slug>/', views.especie, name='especie'),
    path('especies/<slug:slug>/imagem/', views.imagem_especie, name='especie-imagem'),
    path('especies/<slug:slug>/icone/', views.icone_especie, name='especie-icone'),
    path('geometrias/', views.geometrias, name='geometrias'),
    path('consulta/area/', views.consulta_area, name='consulta-area'),
]
