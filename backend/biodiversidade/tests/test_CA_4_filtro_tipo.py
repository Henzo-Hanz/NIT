import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class CA4FiltroTipoTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_filtro_por_cada_tipo_retorna_somente_geometrias_do_tipo(self):
        for tipo in ('ponto', 'linha', 'poligono'):
            with self.subTest(tipo=tipo):
                resposta = self.client.get(f'/api/geometrias/?tipo={tipo}')
                self.assertEqual(resposta.status_code, 200)
                dados = json.loads(resposta.content)
                self.assertGreaterEqual(len(dados['features']), 1)
                for feature in dados['features']:
                    self.assertEqual(feature['properties']['tipo'], tipo)
