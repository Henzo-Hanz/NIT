import time
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

RESPOSTA_MAX_S = 5


class PerfGeometriasTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_geometrias_responde_dentro_do_teto(self):
        ini = time.perf_counter()
        resposta = self.client.get('/api/geometrias/')
        duracao = time.perf_counter() - ini
        self.assertEqual(resposta.status_code, 200)
        self.assertLess(duracao, RESPOSTA_MAX_S)
