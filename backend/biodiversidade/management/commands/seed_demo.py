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
        'imagem': 'biodiversidade/midia/caranguejo-uca.png',
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
        'imagem': 'biodiversidade/midia/caranguejo-maria-farinha.png',
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
        'imagem': 'biodiversidade/midia/caranguejeiro-laranja-do-norte.png',
    },
    {
        'slug': 'guaiamum',
        'nome_popular': 'Guaiamum',
        'nome_cientifico': 'Cardisoma guanhumi',
        'descricao': (
            'O guaiamum (Cardisoma guanhumi) é um caranguejo terrestre de manguezais e '
            'apicuns, de casca azulada e garras robustas, que cava tocas profundas acima '
            'da linha da maré. É muito procurado na culinária do litoral cearense e '
            'piauiense. Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'tamanho_max_cm': 11.0,
            'habitat': 'Manguezal e apicum',
            'cor': 'Azul-escuro',
            'uso': 'Pescado artesanal',
            'curiosidade': 'Volta à toca antes da maré subir e fecha a entrada com lama.',
        },
        'imagem': '',
    },
    {
        'slug': 'aratu',
        'nome_popular': 'Aratu',
        'nome_cientifico': 'Goniopsis cruentata',
        'descricao': (
            'O aratu (Goniopsis cruentata) é um caranguejo ágil das raízes do manguezal, '
            'de coloração avermelhada e patas longas, que sobe troncos e raízes para '
            'escapar da maré. É comum nos mangues do litoral do Ceará e do Piauí. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'tamanho_max_cm': 5.0,
            'habitat': 'Manguezal',
            'cor': 'Vermelho-alaranjado',
            'periodo_atividade': 'Maré baixa',
            'curiosidade': 'Anda de lado pelas raízes como se fosse uma ponte.',
        },
        'imagem': '',
    },
    {
        'slug': 'siri-azul',
        'nome_popular': 'Siri-azul',
        'nome_cientifico': 'Callinectes sapidus',
        'descricao': (
            'O siri-azul (Callinectes sapidus) é um siri nadador de casca azulada e '
            'pinças alongadas que frequenta estuários e praias arenosas do litoral. '
            'Nada com as patas traseiras em forma de remo e é um predador oportunista. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'tamanho_max_cm': 10.0,
            'habitat': 'Estuário e praia arenosa',
            'cor': 'Azul',
            'periodo_atividade': 'Noite',
            'curiosidade': 'Nada de lado com as patas traseiras em formato de remo.',
        },
        'imagem': '',
    },
    {
        'slug': 'badejo',
        'nome_popular': 'Badejo',
        'nome_cientifico': 'Mycteroperca bonaci',
        'descricao': (
            'O badejo (Mycteroperca bonaci) é um peixe de recifes e costões rochosos do '
            'litoral de Pernambuco, muito apreciado na pesca esportiva e na culinária. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'grupo': 'Peixe',
            'tamanho_max_cm': 120.0,
            'habitat': 'Recife de coral e costão rochoso',
            'curiosidade': 'Muda de cor e de padrão para se camuflar no recife.',
        },
        'imagem': '',
    },
    {
        'slug': 'garoupa',
        'nome_popular': 'Garoupa',
        'nome_cientifico': 'Epinephelus marginatus',
        'descricao': (
            'A garoupa (Epinephelus marginatus) é um peixe robusto de costões rochosos '
            'do litoral de Pernambuco, de hábitos solitários e emboscada entre as pedras. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'grupo': 'Peixe',
            'tamanho_max_cm': 150.0,
            'habitat': 'Costão rochoso',
            'curiosidade': 'Começa a vida como fêmea e pode virar macho ao envelhecer.',
        },
        'imagem': '',
    },
    {
        'slug': 'robalo-peva',
        'nome_popular': 'Robalo-peva',
        'nome_cientifico': 'Centropomus parallelus',
        'descricao': (
            'O robalo-peva (Centropomus parallelus) é um peixe estuarino do litoral de '
            'Pernambuco, de corpo prateado e boca grande, que sobe os rios com a maré. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'grupo': 'Peixe',
            'tamanho_max_cm': 60.0,
            'habitat': 'Estuário e manguezal',
            'curiosidade': 'Sobe os rios na maré enchente para caçar em água doce.',
        },
        'imagem': '',
    },
    {
        'slug': 'trinta-reis',
        'nome_popular': 'Trinta-réis',
        'nome_cientifico': 'Thalasseus acuflavidus',
        'descricao': (
            'O trinta-réis (Thalasseus acuflavidus) é uma ave marinha de bico amarelo e '
            'barrete preto que nidifica em colônias nas praias e ilhas de Pernambuco. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'grupo': 'Ave',
            'tamanho_max_cm': 40.0,
            'habitat': 'Praia e estuário',
            'curiosidade': 'Mergulha em picada para capturar peixes na arrebentação.',
        },
        'imagem': '',
    },
    {
        'slug': 'atoba',
        'nome_popular': 'Atobá',
        'nome_cientifico': 'Sula leucogaster',
        'descricao': (
            'O atobá (Sula leucogaster) é uma ave marinha de corpo branco e dorso marrom '
            'que usa ilhas e costões de Pernambuco como dormitório e local de nidificação. '
            'Os dados desta ficha são mockados para o protótipo do mapa.'
        ),
        'infos': {
            'grupo': 'Ave',
            'tamanho_max_cm': 80.0,
            'habitat': 'Ilha e costão rochoso',
            'curiosidade': 'Mergulha de até 20 metros e usa as asas para nadar.',
        },
        'imagem': '',
    },
]

LOCALIDADES = [
    {
        'nome': 'Jericoacoara',
        'coordenadas': [-40.513, -2.797],
        'especies': ['caranguejo-uca', 'guaiamum'],
    },
    {
        'nome': 'Camocim',
        'coordenadas': [-40.84, -2.90],
        'especies': ['caranguejo-uca', 'caranguejo-maria-farinha'],
    },
    {
        'nome': 'Luís Correia',
        'coordenadas': [-41.66, -3.02],
        'especies': ['caranguejo-uca', 'aratu', 'siri-azul'],
    },
    {
        'nome': 'Recife',
        'coordenadas': [-34.881, -8.054],
        'especies': ['badejo', 'trinta-reis', 'garoupa'],
    },
    {
        'nome': 'Porto de Galinhas',
        'coordenadas': [-35.004, -8.508],
        'especies': ['badejo', 'garoupa', 'atoba'],
    },
    {
        'nome': 'Tamandaré',
        'coordenadas': [-35.104, -8.756],
        'especies': ['robalo-peva', 'trinta-reis', 'garoupa', 'badejo'],
    },
    {
        'nome': 'Itamaracá',
        'coordenadas': [-34.825, -7.748],
        'especies': ['badejo'],
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
] + [
    {
        'nome': localidade['nome'],
        'tipo': 'ponto',
        'descricao': f"{len(localidade['especies'])} espécies encontradas",
        'propriedades': {'total': len(localidade['especies'])},
        'especie_slug': slug,
        'geojson': {'type': 'Point', 'coordinates': localidade['coordenadas']},
    }
    for localidade in LOCALIDADES
    for slug in localidade['especies']
]


class Command(BaseCommand):
    help = 'Semeia os dados mockados de biodiversidade (espécies, geometrias e pontos amostrais).'

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
            especie = None
            if dados['especie_slug']:
                especie = Especie.objects.get(slug=dados['especie_slug'])
            defaults = {
                chave: valor for chave, valor in dados.items() if chave != 'especie_slug'
            }
            Geometria.objects.update_or_create(
                nome=dados['nome'],
                especie=especie,
                defaults=defaults,
            )
        self.stdout.write(self.style.SUCCESS('Seed de biodiversidade concluído.'))
