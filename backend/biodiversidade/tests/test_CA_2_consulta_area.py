import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

POLIGONO_CE_PI = {
    'type': 'Polygon',
    'coordinates': [
        [
            [-41.0, -2.7],
            [-40.4, -2.7],
            [-40.4, -3.0],
            [-41.0, -3.0],
            [-41.0, -2.7],
        ]
    ],
}

POLIGONO_AMAZONIA = {
    'type': 'Polygon',
    'coordinates': [
        [
            [-60.0, -3.0],
            [-59.0, -3.0],
            [-59.0, -4.0],
            [-60.0, -4.0],
            [-60.0, -3.0],
        ]
    ],
}


class CA2ConsultaAreaTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def _post(self, corpo):
        return self.client.post(
            '/api/consulta/area/',
            data=json.dumps(corpo),
            content_type='application/json',
        )

    def test_poligono_engloba_apenas_jericoacoara_e_camocim(self):
        resposta = self._post({'poligono': POLIGONO_CE_PI})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        features = dados['pontos']['features']
        self.assertEqual(len(features), 2)
        self.assertEqual(
            {feature['properties']['nome'] for feature in features},
            {'Jericoacoara', 'Camocim'},
        )
        self.assertNotIn(
            'Parnaíba',
            {feature['properties']['nome'] for feature in features},
        )
        for feature in features:
            self.assertEqual(feature['geometry']['type'], 'Point')
        por_nome = {feature['properties']['nome']: feature for feature in features}
        self.assertEqual(por_nome['Jericoacoara']['properties']['total'], 2)
        self.assertEqual(por_nome['Camocim']['properties']['total'], 2)
        self.assertEqual(
            por_nome['Jericoacoara']['geometry']['coordinates'],
            [-40.513, -2.797],
        )
        self.assertEqual(
            por_nome['Camocim']['geometry']['coordinates'],
            [-40.84, -2.9],
        )

        especies = {item['slug']: item for item in dados['especies']}
        self.assertEqual(especies['caranguejo-uca']['contagem'], 2)
        self.assertEqual(especies['guaiamum']['contagem'], 1)
        self.assertEqual(especies['caranguejo-maria-farinha']['contagem'], 1)
        self.assertNotIn('aratu', especies)
        self.assertNotIn('siri-azul', especies)

    def test_poligono_sem_pontos_retorna_listas_vazias(self):
        resposta = self._post({'poligono': POLIGONO_AMAZONIA})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(
            resposta.json(),
            {
                'especies': [],
                'pontos': {'type': 'FeatureCollection', 'features': []},
            },
        )

    def test_sem_poligono_retorna_todos_os_pontos_inclusive_paranaiba(self):
        resposta = self._post({'poligono': None})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        features = dados['pontos']['features']
        self.assertEqual(len(features), 8)
        self.assertEqual(
            {feature['properties']['nome'] for feature in features},
            {
                'Jericoacoara',
                'Camocim',
                'Luís Correia',
                'Parnaíba',
                'Recife',
                'Porto de Galinhas',
                'Tamandaré',
                'Itamaracá',
            },
        )
        por_nome = {feature['properties']['nome']: feature for feature in features}
        paranaiba = por_nome['Parnaíba']['properties']
        self.assertEqual(paranaiba['total'], 223)
        self.assertEqual(paranaiba['especie_slugs'], [])
        self.assertEqual(
            paranaiba['descricao'],
            '223 espécies de caranguejos encontradas',
        )
        especies = {item['slug']: item for item in dados['especies']}
        self.assertEqual(especies['caranguejo-uca']['contagem'], 3)
        self.assertEqual(especies['aratu']['contagem'], 1)
        self.assertEqual(especies['siri-azul']['contagem'], 1)
        self.assertEqual(especies['badejo']['contagem'], 4)
        self.assertEqual(especies['garoupa']['contagem'], 3)
        self.assertEqual(especies['trinta-reis']['contagem'], 2)
        self.assertEqual(especies['robalo-peva']['contagem'], 1)
        self.assertEqual(especies['atoba']['contagem'], 1)

    def test_filtro_animal_nao_inclui_o_ponto_paranaiba(self):
        for termo in ('maria', 'caranguejo'):
            with self.subTest(termo=termo):
                resposta = self._post({'poligono': None, 'animal': termo})
                self.assertEqual(resposta.status_code, 200)
                dados = resposta.json()
                nomes = {
                    feature['properties']['nome']
                    for feature in dados['pontos']['features']
                }
                self.assertNotIn('Parnaíba', nomes)
                self.assertTrue(nomes)

    def test_buraco_do_poligono_exclui_ponto_interno(self):
        poligono_com_buraco = {
            'type': 'Polygon',
            'coordinates': [
                POLIGONO_CE_PI['coordinates'][0],
                [
                    [-40.9, -2.95],
                    [-40.8, -2.95],
                    [-40.8, -2.85],
                    [-40.9, -2.85],
                    [-40.9, -2.95],
                ],
            ],
        }
        resposta = self._post({'poligono': poligono_com_buraco})
        self.assertEqual(resposta.status_code, 200)
        features = resposta.json()['pontos']['features']
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]['properties']['nome'], 'Jericoacoara')

