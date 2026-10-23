from pathlib import Path

import biodiversidade
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from biodiversidade import serializers
from biodiversidade.models import Especie, Geometria

TIPOS_VALIDOS = [valor for valor, _ in Geometria.Tipo.choices]
RAIZ_APP = Path(biodiversidade.__file__).resolve().parent


@api_view(['GET'])
@permission_classes([AllowAny])
def especies(request):
    resumos = serializers.EspecieResumoSerializer(Especie.objects.all(), many=True).data
    return Response(resumos)


@api_view(['GET'])
@permission_classes([AllowAny])
def especie(request, slug):
    registro = get_object_or_404(Especie, slug=slug)
    return Response(serializers.EspecieDetalheSerializer(registro).data)


@api_view(['GET'])
@permission_classes([AllowAny])
def imagem_especie(request, slug):
    registro = get_object_or_404(Especie, slug=slug)
    caminho = RAIZ_APP / registro.imagem.removeprefix('biodiversidade/')
    if not caminho.is_file():
        raise Http404
    return FileResponse(caminho.open('rb'), content_type='image/svg+xml')


@api_view(['GET'])
@permission_classes([AllowAny])
def geometrias(request):
    tipo = request.GET.get('tipo')
    if tipo is not None and tipo not in TIPOS_VALIDOS:
        return Response(
            {'erro': f"tipo '{tipo}' inválido. Tipos válidos: {', '.join(TIPOS_VALIDOS)}."},
            status=400,
        )
    registros = Geometria.objects.select_related('especie').all()
    if tipo is not None:
        registros = registros.filter(tipo=tipo)
    features = [
        {
            'type': 'Feature',
            'properties': {
                'id': registro.id,
                'nome': registro.nome,
                'tipo': registro.tipo,
                'descricao': registro.descricao,
                'especie_slug': registro.especie.slug if registro.especie else None,
                **registro.propriedades,
            },
            'geometry': registro.geojson,
        }
        for registro in registros
    ]
    return Response({'type': 'FeatureCollection', 'features': features})
