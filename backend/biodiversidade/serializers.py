from rest_framework import serializers

from biodiversidade.models import Especie


class EspecieResumoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Especie
        fields = ['slug', 'nome_popular', 'nome_cientifico', 'imagem']


class EspecieDetalheSerializer(serializers.ModelSerializer):
    class Meta:
        model = Especie
        fields = [
            'slug',
            'nome_popular',
            'nome_cientifico',
            'descricao',
            'infos',
            'imagem',
        ]
