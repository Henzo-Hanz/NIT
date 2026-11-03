from pathlib import Path
import json
import mimetypes
import re
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import biodiversidade
from django.db import connection
from django.db.models import Q
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
# Vínculos escolhidos pelo usuário (lapidações 6c/6f): 2ª representação da
# página do gênero Cancer no site (garras grandes à direita — chegou lá
# pesquisando "crab") e o caranguejo clássico de perfil para o genérico
# Brachyura.
ICONES_PREFERIDOS = {
    'cancer': '422060a1-0c7f-4428-b645-bdd26d815482',
    'brachyura': 'fbb93c22-618f-4901-aade-2d07a9797e02',
}
URL_VETOR_BASE = 'https://images.phylopic.org/images'


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
            item = itens[0] if itens else None
            uuid_no = _uuid_de_href(item.get('href') if item else None)
            if uuid_no is None:
                continue
            pref = ICONES_PREFERIDOS.get(str(item.get('title', '')).lower().strip())
            if pref:
                return f'{URL_VETOR_BASE}/{pref}/vector.svg'
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
        ) + ['cancer', 'brachyura']
        try:
            url = _procurar_imagem_por_nomes(nomes)
        except ERROS_REDE:
            url = None
        if url is None:
            # Lapidação 6 (SPEC-0005): sem silhueta na PhyloPic (ou rede
            # fora), o ícone cai para a foto da própria espécie em midia/;
            # 404 só quando não há silhueta nem foto (ex. guaiamum).
            if registro.imagem:
                caminho_foto = RAIZ_APP / registro.imagem.removeprefix('biodiversidade/')
                if caminho_foto.is_file():
                    dispositivo, _ = mimetypes.guess_type(caminho_foto.name)
                    return FileResponse(
                        caminho_foto.open('rb'),
                        content_type=dispositivo or 'application/octet-stream',
                    )
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


def _e_numero(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def _validar_poligono(poligono):
    if poligono is None:
        return None
    if not isinstance(poligono, dict) or poligono.get('type') != 'Polygon':
        return 'poligono deve ser um objeto GeoJSON do tipo Polygon ou null.'
    aneis = poligono.get('coordinates')
    if not isinstance(aneis, list) or not aneis:
        return 'poligono.coordinates deve ser uma lista de anéis.'
    for anel in aneis:
        if not isinstance(anel, list) or len(anel) < 4:
            return 'Cada anel deve ter ao menos 4 posições [lon, lat].'
        for posicao in anel:
            if not isinstance(posicao, list) or len(posicao) != 2:
                return 'Cada posição deve ser uma lista [lon, lat].'
            if not all(_e_numero(valor) for valor in posicao):
                return 'As coordenadas devem ser numéricas.'
        if anel[0] != anel[-1]:
            return 'O primeiro e o último ponto de cada anel devem ser iguais.'
    return None


def _ponto_em_anel(x, y, anel):
    dentro = False
    anterior = anel[-1]
    for atual in anel:
        xi, yi = atual
        xj, yj = anterior
        if (yi > y) != (yj > y):
            interseccao = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < interseccao:
                dentro = not dentro
        anterior = atual
    return dentro


def _ponto_no_poligono(x, y, aneis):
    if not _ponto_em_anel(x, y, aneis[0]):
        return False
    return not any(_ponto_em_anel(x, y, anel) for anel in aneis[1:])


def _agrupar_pontos(registros, aneis=None):
    bbox = None
    if aneis:
        externo = aneis[0]
        longitudes = [posicao[0] for posicao in externo]
        latitudes = [posicao[1] for posicao in externo]
        bbox = (
            min(longitudes),
            min(latitudes),
            max(longitudes),
            max(latitudes),
        )

    grupos = {}
    for registro in registros:
        geometria = registro.geojson or {}
        if geometria.get('type') != 'Point':
            continue
        coordenadas = geometria.get('coordinates')
        if not isinstance(coordenadas, (list, tuple)) or len(coordenadas) < 2:
            continue
        x, y = coordenadas[0], coordenadas[1]
        if not (_e_numero(x) and _e_numero(y)):
            continue
        if bbox is not None:
            if not (bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3]):
                continue
            if not _ponto_no_poligono(x, y, aneis):
                continue
        chave = (registro.nome, tuple(coordenadas))
        grupo = grupos.get(chave)
        if grupo is None:
            grupo = {
                'id': registro.id,
                'descricao': registro.descricao,
                'especies': {},
                'total_sem_especie': None,
            }
            grupos[chave] = grupo
        if registro.especie is None:
            # SEM número mockado: só entra como contagem real; ausente → None.
            grupo['total_sem_especie'] = registro.propriedades.get('total')
        else:
            grupo['especies'].setdefault(registro.especie.slug, registro.especie.nome_popular)
    return grupos


def _features_de_grupos(grupos, busca_slugs_por_chave=None):
    features = []
    for (nome, coordenadas), grupo in grupos.items():
        propriedades = {
            'id': grupo['id'],
            'nome': nome,
            'descricao': grupo['descricao'],
            'especie_slugs': list(grupo['especies']),
        }
        # 'total' só aparece quando existe valor real: contagem de
        # especie_slugs ou o total guardado no seed. Sem valor → ausente.
        if grupo['especies']:
            propriedades['total'] = len(grupo['especies'])
        elif grupo['total_sem_especie'] is not None:
            propriedades['total'] = grupo['total_sem_especie']
        if busca_slugs_por_chave is not None:
            propriedades['busca_slugs'] = busca_slugs_por_chave.get((nome, coordenadas), [])
        features.append(
            {
                'type': 'Feature',
                'properties': propriedades,
                'geometry': {'type': 'Point', 'coordinates': list(coordenadas)},
            }
        )
    return features


@api_view(['POST'])
@permission_classes([AllowAny])
def consulta_area(request):
    try:
        corpo = json.loads(request.body or b'{}')
    except (json.JSONDecodeError, UnicodeDecodeError):
        return Response({'erro': 'Corpo da requisição deve ser um JSON objeto.'}, status=400)
    if not isinstance(corpo, dict):
        return Response({'erro': 'Corpo da requisição deve ser um JSON objeto.'}, status=400)

    poligono = corpo.get('poligono')
    animal = corpo.get('animal')
    ordenar = corpo.get('ordenar')

    erro = _validar_poligono(poligono)
    if erro:
        return Response({'erro': erro}, status=400)
    if animal is not None and not isinstance(animal, str):
        return Response({'erro': 'animal deve ser uma string ou null.'}, status=400)
    if ordenar not in (None, 'mais', 'menos'):
        return Response({'erro': "ordenar deve ser 'mais', 'menos' ou null."}, status=400)

    registros = Geometria.objects.select_related('especie').filter(tipo='ponto')
    termo = (animal or '').strip()
    if termo:
        registros = registros.filter(
            Q(especie__nome_popular__icontains=termo)
            | Q(especie__nome_cientifico__icontains=termo)
        )

    aneis = poligono['coordinates'] if poligono else None
    grupos = _agrupar_pontos(registros, aneis)

    contagens = {}
    for (nome, coordenadas), grupo in grupos.items():
        for slug, nome_popular in grupo['especies'].items():
            contagem = contagens.setdefault(
                slug,
                {'slug': slug, 'nome_popular': nome_popular, 'localidades': set()},
            )
            contagem['localidades'].add((nome, coordenadas))

    features = _features_de_grupos(grupos)

    especies = [
        {
            'slug': item['slug'],
            'nome_popular': item['nome_popular'],
            'contagem': len(item['localidades']),
        }
        for item in contagens.values()
    ]
    if ordenar == 'mais':
        especies.sort(key=lambda item: (-item['contagem'], item['nome_popular']))
    elif ordenar == 'menos':
        especies.sort(key=lambda item: (item['contagem'], item['nome_popular']))
    else:
        especies.sort(key=lambda item: item['nome_popular'])

    return Response(
        {
            'especies': especies,
            'pontos': {'type': 'FeatureCollection', 'features': features},
        }
    )


# Índice FTS5 criado pela migração 0002 (content table externa sobre
# biodiversidade_especie). O tokenizer padrão (unicode61) já normaliza caixa
# e remove acentos — verificado no SQLite 3.51.2 do projeto: 'uca*' encontra
# 'Caranguejo-uçá', então não há premissa pendente sobre acentuação.
TABELA_FTS = 'biodiversidade_especies_fts'
# Ao menos um caractere que o tokenizer unicode61 indexa (letra/dígito
# unicode; sublinha só é separador).
CARACTERE_UTIL = re.compile(r'[^\W_]')


def _consulta_fts(termo):
    # Margem de segurança contra a sintaxe FTS5: cada token do usuário vira
    # string entre aspas duplas (aspas internas dobradas) seguida de '*' —
    # busca prefixada case/acentos-insensível, tokens unidos por AND implícito.
    return ' '.join('"%s"*' % token.replace('"', '""') for token in termo.split())


@api_view(['GET'])
@permission_classes([AllowAny])
def busca_pontos(request):
    termo = (request.GET.get('q') or '').strip()
    if not CARACTERE_UTIL.search(termo):
        return Response(
            {'erro': 'Parâmetro q é obrigatório e deve conter letras ou números.'},
            status=400,
        )

    with connection.cursor() as cursor:
        cursor.execute(
            f'SELECT rowid, bm25({TABELA_FTS}) AS posicao '
            f'FROM {TABELA_FTS} WHERE {TABELA_FTS} MATCH %s ORDER BY posicao',
            [_consulta_fts(termo)],
        )
        linhas = cursor.fetchall()

    ids_por_rank = [linha[0] for linha in linhas]
    especies_achadas = Especie.objects.in_bulk(ids_por_rank)
    especies = [
        {
            'slug': especies_achadas[id_especie].slug,
            'nome_popular': especies_achadas[id_especie].nome_popular,
        }
        for id_especie in ids_por_rank
        if id_especie in especies_achadas
    ]
    slugs_rank = [item['slug'] for item in especies]

    registros = (
        Geometria.objects.select_related('especie')
        .filter(tipo='ponto')
        .filter(Q(especie__slug__in=slugs_rank) | Q(nome__icontains=termo))
    )
    grupos = _agrupar_pontos(registros)

    # Premissas registradas: (a) o ponto do Parnaíba entra mesmo sem espécie
    # com match, porque o nome da localidade contém o termo (icontains);
    # (b) pontos que batem só pelo nome ficam com busca_slugs vazio e caem no
    # fim da ordenação, pois têm 0 correspondências de espécie.
    posicao_do_slug = {slug: posicao for posicao, slug in enumerate(slugs_rank)}
    busca_slugs_por_chave = {
        chave: sorted(
            (slug for slug in grupo['especies'] if slug in posicao_do_slug),
            key=posicao_do_slug.__getitem__,
        )
        for chave, grupo in grupos.items()
    }
    features = _features_de_grupos(grupos, busca_slugs_por_chave)
    features.sort(
        key=lambda feature: (
            -len(feature['properties']['busca_slugs']),
            feature['properties']['nome'],
        )
    )

    return Response(
        {
            'especies': especies,
            'pontos': {'type': 'FeatureCollection', 'features': features},
        }
    )
