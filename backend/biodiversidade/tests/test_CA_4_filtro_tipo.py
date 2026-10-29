import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class CA4FiltroTipoTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_filtro_por_tipo_ponto_retorna_somente_pontos(self):
        resposta = self.client.get('/api/geometrias/?tipo=ponto')
        self.assertEqual(resposta.status_code, 200)
        dados = json.loads(resposta.content)
        self.assertGreaterEqual(len(dados['features']), 1)
        for feature in dados['features']:
            self.assertEqual(feature['properties']['tipo'], 'ponto')
            self.assertEqual(feature['geometry']['type'], 'Point')

    def test_filtro_por_linha_e_poligono_retorna_zero_features(self):
        for tipo in ('linha', 'poligono'):
            with self.subTest(tipo=tipo):
                resposta = self.client.get(f'/api/geometrias/?tipo={tipo}')
                self.assertEqual(resposta.status_code, 200)
                dados = json.loads(resposta.content)
                self.assertEqual(dados['features'], [])
