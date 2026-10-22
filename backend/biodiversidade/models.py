from django.db import models


class Especie(models.Model):
    slug = models.SlugField(unique=True)
    nome_popular = models.CharField(max_length=120)
    nome_cientifico = models.CharField(max_length=120, null=True, blank=True)
    descricao = models.TextField()
    infos = models.JSONField(default=dict)
    imagem = models.CharField(max_length=200)

    class Meta:
        ordering = ['nome_popular']

    def __str__(self):
        return self.nome_popular


class Geometria(models.Model):
    class Tipo(models.TextChoices):
        PONTO = 'ponto', 'Ponto'
        LINHA = 'linha', 'Linha'
        POLIGONO = 'poligono', 'Polígono'

    nome = models.CharField(max_length=120)
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    descricao = models.TextField(blank=True)
    propriedades = models.JSONField(default=dict)
    especie = models.ForeignKey(
        Especie,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='geometrias',
    )
    geojson = models.JSONField()

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.tipo}:{self.nome}'
