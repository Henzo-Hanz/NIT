import time

from django.test import TestCase

RESPOSTA_MAX_S = 60


class PerfPingTest(TestCase):
    def test_ping_responde_dentro_do_teto(self):
        ini = time.perf_counter()
        resposta = self.client.get('/api/ping/')
        duracao = time.perf_counter() - ini
        self.assertEqual(resposta.status_code, 200)
        self.assertLess(duracao, RESPOSTA_MAX_S)
