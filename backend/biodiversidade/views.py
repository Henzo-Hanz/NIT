from pathlib import Path
import json
import mimetypes
import re
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

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
BASE_PHYLOPIC = 'https://api.phylopic.org'
PASTA_ICONES = RAIZ_APP / 'midia' / 'icones'
ERROS_REDE = (URLError, TimeoutError)


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
    dispositivo, _ = mimetypes.guess_type(caminho.name)
    return FileResponse(caminho.open('rb'), content_type=dispositivo or 'application/octet-stream')


def _pegar_json(url):
    pedido = Request(url, headers={'Accept': 'application/vnd.phylopic.v2+json'})
    with urlopen(pedido, timeout=15) as resposta:
        return json.loads(resposta.read().decode('utf-8'))


def _baixar_arquivo(url, destino):
    with urlopen(url, timeout=30) as resposta:
        destino.write_bytes(resposta.read())


def _uuid_de_href(href):
    if not href:
        return None
    encontrados = re.findall(r'[0-9a-f-]{36}', href)
    return encontrados[0] if encontrados else None


def _procurar_imagem_por_nomes(nomes):
    build = _pegar_json(BASE_PHYLOPIC).get('build')
    for nome in nomes:
        busca = nome.lower().strip()
        if not busca:
            continue
        try:
            itens = _pegar_json(
                f'{BASE_PHYLOPIC}/nodes?build={build}&page=0&filter_name={quote(busca)}'
            ).get('_links', {}).get('items', [])
            uuid_no = _uuid_de_href(itens[0].get('href') if itens else None)
            if uuid_no is None:
                continue
            imagens = _pegar_json(
                f'{BASE_PHYLOPIC}/images?build={build}&page=0&filter_node={uuid_no}&embed_items=true'
            ).get('_embedded', {}).get('items', [])
            if imagens:
                url_vetor = imagens[0].get('_links', {}).get('vectorFile', {}).get('href')
                if url_vetor:
                    return url_vetor
            no = _pegar_json(f'{BASE_PHYLOPIC}/nodes/{uuid_no}?embed_primaryImage=true&build={build}')
            imagem = no.get('_embedded', {}).get('primaryImage')
            url_vetor = imagem.get('_links', {}).get('vectorFile', {}).get('href') if imagem else None
            if url_vetor:
                return url_vetor
        except ERROS_REDE:
            continue
    return None


@api_view(['GET'])
@permission_classes([AllowAny])
def icone_especie(request, slug):
    registro = get_object_or_404(Especie, slug=slug)
    PASTA_ICONES.mkdir(parents=True, exist_ok=True)
    caminho = PASTA_ICONES / f'{slug}.svg'
    if not (caminho.is_file() and caminho.stat().st_size > 0):
        nomes = (
            [registro.nome_cientifico, registro.nome_cientifico.split()[0]]
            if registro.nome_cientifico
            else []
        ) + ['Brachyura']
        try:
            url = _procurar_imagem_por_nomes(nomes)
        except ERROS_REDE:
            url = None
        if url is None:
            raise Http404
        _baixar_arquivo(url, caminho)
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
