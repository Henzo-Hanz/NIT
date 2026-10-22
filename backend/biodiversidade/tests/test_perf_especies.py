import time
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

RESPOSTA_MAX_S = 5


class PerfEspeciesTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_especies_responde_dentro_do_teto(self):
        ini = time.perf_counter()
        resposta = self.client.get('/api/especies/')
        duracao = time.perf_counter() - ini
        self.assertEqual(resposta.status_code, 200)
        self.assertLess(duracao, RESPOSTA_MAX_S)

    def test_detalhe_especie_responde_dentro_do_teto(self):
        ini = time.perf_counter()
        resposta = self.client.get('/api/especies/caranguejo-uca/')
        duracao = time.perf_counter() - ini
        self.assertEqual(resposta.status_code, 200)
        self.assertLess(duracao, RESPOSTA_MAX_S)
