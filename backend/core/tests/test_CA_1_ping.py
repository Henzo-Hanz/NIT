import json

from django.test import TestCase


class CA1PingTest(TestCase):
    def test_get_ping_retorna_200_com_status_ok(self):
        resposta = self.client.get('/api/ping/')
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta['Content-Type'].startswith('application/json'), True)
        self.assertEqual(json.loads(resposta.content), {"status": "ok"})
