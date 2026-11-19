import json
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from django.test import TestCase

from biodiversidade import views


class RespostaCrua:
    def __init__(self, corpo):
        self._corpo = corpo

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class CA3RotaIndisponivelTest(TestCase):
    URL = '/api/rota/?de=-41.0,-2.9&ate=-40.8,-2.7'

    def _get(self, **patch_kwargs):
        with patch.object(views, 'urlopen', **patch_kwargs):
            return self.client.get(self.URL)

    def _assert_502_generico(self, resposta):
        self.assertEqual(resposta.status_code, 502)
        corpo = resposta.content.decode('utf-8')
        self.assertIn('erro', resposta.json())
        self.assertNotIn('http', corpo.lower())
        self.assertNotIn('traceback', corpo.lower())
        self.assertNotIn('osrm', corpo.lower())

    def test_erro_de_rede_retorna_502(self):
        self._assert_502_generico(self._get(side_effect=URLError('conexao recusada')))

    def test_timeout_retorna_502(self):
        self._assert_502_generico(self._get(side_effect=TimeoutError('demorou')))

    def test_http_error_retorna_502(self):
        erro = HTTPError('https://interno.exemplo/rota', 500, 'falhou', {}, None)
        self._assert_502_generico(self._get(side_effect=erro))

    def test_json_invalido_retorna_502(self):
        resposta = self._get(return_value=RespostaCrua(b'{nao e json'))
        self._assert_502_generico(resposta)

    def test_resposta_sem_rota_retorna_502(self):
        corpo = json.dumps({'code': 'NoRoute', 'routes': []}).encode('utf-8')
        self._assert_502_generico(self._get(return_value=RespostaCrua(corpo)))

    def test_resposta_sem_geometria_valida_retorna_502(self):
        corpo = json.dumps(
            {
                'code': 'Ok',
                'routes': [{'distance': 10.0, 'geometry': {'type': 'Point', 'coordinates': []}}],
            }
        ).encode('utf-8')
        self._assert_502_generico(self._get(return_value=RespostaCrua(corpo)))
