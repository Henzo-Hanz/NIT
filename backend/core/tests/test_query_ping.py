from django.test import TestCase


class QueryPingTest(TestCase):
    def test_ping_nao_acessa_banco(self):
        with self.assertNumQueries(0):
            resposta = self.client.get('/api/ping/')
        self.assertEqual(resposta.status_code, 200)
