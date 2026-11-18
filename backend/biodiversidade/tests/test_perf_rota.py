import json
import time
from unittest.mock import patch

from django.test import TestCase

from biodiversidade import views

RESPOSTA_MAX_S = 60


class RespostaFalsa:
    def __init__(self, corpo):
        self._corpo = json.dumps(corpo).encode('utf-8')

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class PerfRotaTest(TestCase):
    def test_rota_responde_dentro_do_teto(self):
        corpo = {
            'code': 'Ok',
            'routes': [
                {
                    'distance': 100.0,
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [[-41.0, -2.9], [-40.8, -2.7]],
                    },
                }
            ],
        }
        ini = time.perf_counter()
        with patch.object(views, 'urlopen', return_value=RespostaFalsa(corpo)):
            resposta = self.client.get('/api/rota/?de=-41.0,-2.9&ate=-40.8,-2.7')
        duracao = time.perf_counter() - ini
        self.assertEqual(resposta.status_code, 200)
        self.assertLess(duracao, RESPOSTA_MAX_S)
