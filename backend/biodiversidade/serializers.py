from rest_framework import serializers

from biodiversidade.models import Especie


class EspecieResumoSerializer(serializers.ModelSerializer):
    grupo = serializers.SerializerMethodField()

    class Meta:
        model = Especie
        fields = ['slug', 'nome_popular', 'nome_cientifico', 'grupo', 'imagem']

    def get_grupo(self, obj):
        return (obj.infos or {}).get('grupo', 'Crustáceo')


class EspecieDetalheSerializer(serializers.ModelSerializer):
    grupo = serializers.SerializerMethodField()

    class Meta:
        model = Especie
        fields = [
            'slug',
            'nome_popular',
            'nome_cientifico',
            'grupo',
            'descricao',
            'infos',
            'imagem',
        ]

    def get_grupo(self, obj):
        return (obj.infos or {}).get('grupo', 'Crustáceo')
