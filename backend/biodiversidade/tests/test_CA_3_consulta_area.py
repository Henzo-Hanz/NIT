import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class CA3ConsultaAreaTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def _post(self, corpo):
        return self.client.post(
            '/api/consulta/area/',
            data=json.dumps(corpo),
            content_type='application/json',
        )

    def test_filtro_animal_maria_retorna_so_pontos_com_maria_farinha(self):
        # Lapidação 12: além de Camocim, Tibau e Caiçara do Norte (RN) têm
        # maria-farinha — o filtro é por nome da espécie, não por localidade.
        for termo in ('maria', 'MARIA'):
            with self.subTest(termo=termo):
                resposta = self._post({'poligono': None, 'animal': termo})
                self.assertEqual(resposta.status_code, 200)
                dados = resposta.json()
                features = dados['pontos']['features']
                self.assertEqual(len(features), 3)
                self.assertEqual(
                    {feature['properties']['nome'] for feature in features},
                    {'Camocim', 'Tibau', 'Caiçara do Norte'},
                )
                for feature in features:
                    self.assertEqual(
                        feature['properties']['especie_slugs'],
                        ['caranguejo-maria-farinha'],
                    )
                    self.assertEqual(feature['properties']['total'], 1)
                self.assertEqual(
                    [item['slug'] for item in dados['especies']],
                    ['caranguejo-maria-farinha'],
                )

    def test_filtro_animal_por_nome_cientifico_e_case_insensitive(self):
        resposta = self._post({'poligono': None, 'animal': 'oCyPoDe'})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(
            [item['slug'] for item in dados['especies']],
            ['caranguejo-maria-farinha'],
        )
        self.assertEqual(
            {feature['properties']['nome'] for feature in dados['pontos']['features']},
            {'Camocim', 'Tibau', 'Caiçara do Norte'},
        )

    def test_ordenar_mais_coloca_os_mais_frequentes_primeiro(self):
        # Lapidação 12: com as localidades novas do CE/RN, uca e trinta-réis
        # empatam em 6 (tie-break nome_popular), depois badejo/garoupa/
        # siri-azul em 5.
        resposta = self._post({'poligono': None, 'ordenar': 'mais'})
        self.assertEqual(resposta.status_code, 200)
        especies = resposta.json()['especies']
        self.assertEqual(especies[0]['slug'], 'caranguejo-uca')
        self.assertEqual(especies[0]['contagem'], 6)
        self.assertEqual(
            [item['nome_popular'] for item in especies],
            [
                'Caranguejo-uçá',
                'Trinta-réis',
                'Badejo',
                'Garoupa',
                'Siri-azul',
                'Atobá',
                'Caranguejo maria-farinha',
                'Robalo-peva',
                'Aratu',
                'Caranguejeiro-laranja-do-norte',
                'Guaiamum',
            ],
        )
        contagens = [item['contagem'] for item in especies]
        self.assertEqual(contagens, sorted(contagens, reverse=True))

    def test_ordenar_menos_coloca_os_com_mais_pontos_no_fim(self):
        # Empate em 6 no fim (lapidação 12: uca e trinta-réis); no empate,
        # ordena por nome_popular — uca antes, trinta-réis por último.
        resposta = self._post({'poligono': None, 'ordenar': 'menos'})
        self.assertEqual(resposta.status_code, 200)
        especies = resposta.json()['especies']
        self.assertEqual(especies[-2]['slug'], 'caranguejo-uca')
        self.assertEqual(especies[-1]['slug'], 'trinta-reis')
        self.assertEqual(especies[-1]['contagem'], 6)
        self.assertEqual(
            [item['nome_popular'] for item in especies],
            [
                'Caranguejeiro-laranja-do-norte',
                'Guaiamum',
                'Aratu',
                'Caranguejo maria-farinha',
                'Robalo-peva',
                'Atobá',
                'Badejo',
                'Garoupa',
                'Siri-azul',
                'Caranguejo-uçá',
                'Trinta-réis',
            ],
        )
        contagens = [item['contagem'] for item in especies]
        self.assertEqual(contagens, sorted(contagens))

    def test_ordenacao_padrao_usa_nome_popular(self):
        resposta = self._post({'poligono': None, 'ordenar': None})
        self.assertEqual(resposta.status_code, 200)
        nomes = [item['nome_popular'] for item in resposta.json()['especies']]
        self.assertEqual(nomes, sorted(nomes))

    def test_poligono_que_engloba_o_paranaiba_devolve_o_ponto_com_especies_demo(self):
        # Lapidação 8 (SPEC-0005): espécies demo do dono (reversível). Sem
        # número mockado (lapidação 4): 'total' = contagem real da view,
        # igual a len(especie_slugs).
        poligono_paranaiba = {
            'type': 'Polygon',
            'coordinates': [
                [
                    [-42.2, -2.5],
                    [-41.2, -2.5],
                    [-41.2, -3.3],
                    [-42.2, -3.3],
                    [-42.2, -2.5],
                ]
            ],
        }
        resposta = self._post({'poligono': poligono_paranaiba})
        self.assertEqual(resposta.status_code, 200)
        features = resposta.json()['pontos']['features']
        por_nome = {feature['properties']['nome']: feature for feature in features}
        self.assertIn('Parnaíba', por_nome)
        paranaiba = por_nome['Parnaíba']['properties']
        self.assertEqual(
            paranaiba['especie_slugs'],
            ['caranguejo-uca', 'caranguejeiro-laranja-do-norte'],
        )
        self.assertEqual(paranaiba['total'], len(paranaiba['especie_slugs']))
        self.assertEqual(
            por_nome['Parnaíba']['geometry']['coordinates'],
            [-41.7767, -2.9035],
        )

    def test_corpos_invalidos_retornam_400_com_erro(self):
        casos_invalidos = {
            'poligono_tipo_errado': {
                'poligono': {'type': 'LineString', 'coordinates': []},
            },
            'anel_aberto': {
                'poligono': {
                    'type': 'Polygon',
                    'coordinates': [
                        [
                            [-41.0, -2.7],
                            [-40.4, -2.7],
                            [-40.4, -3.0],
                            [-41.0, -3.0],
                            [-41.0, -2.65],
                        ]
                    ],
                },
            },
            'anel_com_menos_de_quatro_posicoes': {
                'poligono': {
                    'type': 'Polygon',
                    'coordinates': [[[-41.0, -2.7], [-40.4, -2.7], [-41.0, -2.7]]],
                },
            },
            'poligono_sem_aneis': {
                'poligono': {'type': 'Polygon', 'coordinates': []},
            },
            'ordenar_invalido': {'poligono': None, 'ordenar': 'talvez'},
            'animal_nao_string': {'poligono': None, 'animal': 123},
            'corpo_nao_objeto': [],
        }
        for nome, corpo in casos_invalidos.items():
            with self.subTest(caso=nome):
                resposta = self._post(corpo)
                self.assertEqual(resposta.status_code, 400)
                self.assertIn('erro', resposta.json())

    def test_corpo_json_malformado_retorna_400(self):
        resposta = self.client.post(
            '/api/consulta/area/',
            data='{nao é json',
            content_type='application/json',
        )
        self.assertEqual(resposta.status_code, 400)
        self.assertIn('erro', resposta.json())
