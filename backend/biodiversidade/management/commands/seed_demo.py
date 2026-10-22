from django.core.management.base import BaseCommand

from biodiversidade.models import Especie, Geometria

ESPECIES = [
    {
        'slug': 'caranguejo-uca',
        'nome_popular': 'Caranguejo-uçá',
        'nome_cientifico': 'Ucides cordatus',
        'descricao': (
            'O caranguejo-uçá (Ucides cordatus), o famoso "sirgeijo" do léxico do litoral '
            'piauiense, é o maior caranguejo do manguezal brasileiro e o grande arquiteto dele: '
            'cava tocas de até um metro no lodo, areja o solo e processa as folhas que caem dos '
            'mangues. A pesca dele sustenta comunidades tradicionais do Delta do Parnaíba e é '
            'regulada pela andada, o período de amadurecimento no qual a coleta é vedada. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'tamanho_max_cm': 9.0,
            'habitat': 'Manguezal',
            'sazonalidade': 'Andada (coleta vedada) de novembro a janeiro',
            'uso': 'Pescado artesanal',
            'curiosidade': 'Sobe a lama nas raízes para se defender da maré.',
        },
        'imagem': 'biodiversidade/midia/caranguejo-uca.svg',
    },
    {
        'slug': 'caranguejo-maria-farinha',
        'nome_popular': 'Caranguejo maria-farinha',
        'nome_cientifico': 'Ocypode quadrata',
        'descricao': (
            'O caranguejo maria-farinha (Ocypode quadrata) é o corredor veloz das praias '
            'arenosas do litoral do Piauí: mora em burros afastados da linha de água, levanta '
            'os olhos sobre longos pedúnculos para vigiar a orla e dispara em velocidade '
            'surpreendente quando alguém se aproxima. Sai de sua toca ao entardecer para '
            'limpar a praia do que a maré deixou, folhas e detritos incluídos. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'tamanho_max_cm': 4.0,
            'habitat': 'Praia arenosa',
            'periodo_atividade': 'Crepúsculo e noite',
            'velocidade_max_ms': 3.0,
            'curiosidade': 'Rola bolinhas de areia comedoras: daí o apelido maria-farinha.',
        },
        'imagem': 'biodiversidade/midia/caranguejo-maria-farinha.svg',
    },
    {
        'slug': 'caranguejeiro-laranja-do-norte',
        'nome_popular': 'Caranguejeiro-laranja-do-norte',
        'nome_cientifico': None,
        'descricao': (
            'O caranguejeiro-laranja-do-norte é um registro popular usado neste protótipo: '
            'nome dado por barqueiros do Delta a um caranguejo grande de casca alaranjada '
            'que aparece na restinga depois das marés de sizígia. A ficha documenta como o '
            'sistema mostra espécies ainda sem diagnose científica formal, com todas as '
            'informações inventadas para fins de demonstração.'
        ),
        'infos': {
            'tamanho_max_cm': 7.5,
            'habitat': 'Restinga e apicuns',
            'cor': 'Laranja intenso',
            'registro': 'Popular, sem diagnose científica formal',
            'curiosidade': 'Troca de casca duas vezes por ano e fica mais laranja a cada troca.',
        },
        'imagem': 'biodiversidade/midia/caranguejeiro-laranja-do-norte.svg',
    },
]

GEOMETRIAS = [
    {
        'nome': 'Parnaíba',
        'tipo': 'ponto',
        'descricao': '223 espécies de caranguejos encontradas',
        'propriedades': {'total': 223},
        'especie_slug': None,
        'geojson': {'type': 'Point', 'coordinates': [-41.7767, -2.9035]},
    },
    {
        'nome': 'Linha de costa amostral',
        'tipo': 'linha',
        'descricao': 'Transecto simplificado da linha de costa para protótipo',
        'propriedades': {},
        'especie_slug': None,
        'geojson': {
            'type': 'LineString',
            'coordinates': [
                [-41.86, -2.87],
                [-41.82, -2.94],
                [-41.78, -3.01],
                [-41.74, -3.1],
            ],
        },
    },
    {
        'nome': 'APA Delta do Parnaíba (mock)',
        'tipo': 'poligono',
        'descricao': 'Simplificação retangular da área protegida para demonstração',
        'propriedades': {},
        'especie_slug': None,
        'geojson': {
            'type': 'Polygon',
            'coordinates': [
                [
                    [-41.95, -2.75],
                    [-41.4, -2.75],
                    [-41.4, -3.2],
                    [-41.95, -3.2],
                    [-41.95, -2.75],
                ]
            ],
        },
    },
]


class Command(BaseCommand):
    help = 'Semeia os dados mockados de biodiversidade (3 espécies e 3 geometrias).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--recriar',
            action='store_true',
            help='apaga os registros atuais e recria a semeadura',
        )

    def handle(self, *args, **options):
        if options['recriar']:
            Geometria.objects.all().delete()
            Especie.objects.all().delete()
        for dados in ESPECIES:
            Especie.objects.update_or_create(slug=dados['slug'], defaults=dados)
        for dados in GEOMETRIAS:
            defaults = {
                chave: valor for chave, valor in dados.items() if chave != 'especie_slug'
            }
            Geometria.objects.update_or_create(nome=dados['nome'], defaults=defaults)
        self.stdout.write(self.style.SUCCESS('Seed de biodiversidade concluído.'))
