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

    def test_filtro_animal_maria_retorna_so_o_ponto_de_camocim(self):
        for termo in ('maria', 'MARIA'):
            with self.subTest(termo=termo):
                resposta = self._post({'poligono': None, 'animal': termo})
                self.assertEqual(resposta.status_code, 200)
                dados = resposta.json()
                features = dados['pontos']['features']
                self.assertEqual(len(features), 1)
                propriedades = features[0]['properties']
                self.assertEqual(propriedades['nome'], 'Camocim')
                self.assertEqual(
                    propriedades['especie_slugs'],
                    ['caranguejo-maria-farinha'],
                )
                self.assertEqual(propriedades['total'], 1)
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
            [feature['properties']['nome'] for feature in dados['pontos']['features']],
            ['Camocim'],
        )

    def test_ordenar_mais_coloca_uca_primeiro(self):
        resposta = self._post({'poligono': None, 'ordenar': 'mais'})
        self.assertEqual(resposta.status_code, 200)
        especies = resposta.json()['especies']
        self.assertEqual(especies[0]['slug'], 'caranguejo-uca')
        self.assertEqual(especies[0]['contagem'], 3)
        self.assertEqual(
            [item['nome_popular'] for item in especies],
            [
                'Caranguejo-uçá',
                'Aratu',
                'Caranguejo maria-farinha',
                'Guaiamum',
                'Siri-azul',
            ],
        )
        contagens = [item['contagem'] for item in especies]
        self.assertEqual(contagens, sorted(contagens, reverse=True))

    def test_ordenar_menos_coloca_uca_por_ultimo(self):
        resposta = self._post({'poligono': None, 'ordenar': 'menos'})
        self.assertEqual(resposta.status_code, 200)
        especies = resposta.json()['especies']
        self.assertEqual(especies[-1]['slug'], 'caranguejo-uca')
        self.assertEqual(especies[-1]['contagem'], 3)
        self.assertEqual(
            [item['nome_popular'] for item in especies],
            [
                'Aratu',
                'Caranguejo maria-farinha',
                'Guaiamum',
                'Siri-azul',
                'Caranguejo-uçá',
            ],
        )
        contagens = [item['contagem'] for item in especies]
        self.assertEqual(contagens, sorted(contagens))

    def test_ordenacao_padrao_usa_nome_popular(self):
        resposta = self._post({'poligono': None, 'ordenar': None})
        self.assertEqual(resposta.status_code, 200)
        nomes = [item['nome_popular'] for item in resposta.json()['especies']]
        self.assertEqual(nomes, sorted(nomes))

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
