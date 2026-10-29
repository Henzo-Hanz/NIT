import json
import time
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

RESPOSTA_MAX_S = 5

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


class PerfConsultaAreaTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def _post(self, corpo):
        return self.client.post(
            '/api/consulta/area/',
            data=json.dumps(corpo),
            content_type='application/json',
        )

    def test_consulta_area_usa_uma_consulta_ao_banco(self):
        with self.assertNumQueries(1):
            resposta = self._post(
                {'poligono': POLIGONO_CE_PI, 'animal': None, 'ordenar': None}
            )
        self.assertEqual(resposta.status_code, 200)

    def test_consulta_area_responde_dentro_do_teto(self):
        ini = time.perf_counter()
        resposta = self._post(
            {'poligono': POLIGONO_CE_PI, 'animal': None, 'ordenar': 'mais'}
        )
        duracao = time.perf_counter() - ini
        self.assertEqual(resposta.status_code, 200)
        self.assertLess(duracao, RESPOSTA_MAX_S)
