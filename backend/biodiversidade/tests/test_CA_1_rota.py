import json
from unittest.mock import patch

from django.test import TestCase

from biodiversidade import views

URL_OSRM = 'https://osrm.exemplo.test'
RESPOSTA_OK = {
    'code': 'Ok',
    'routes': [
        {
            'distance': 1234.5,
            'duration': 99.9,
            'geometry': {
                'type': 'LineString',
                'coordinates': [
                    [-41.0, -2.9],
                    [-40.9, -2.8],
                    [-40.8, -2.7],
                ],
            },
        }
    ],
}


class RespostaFalsa:
    def __init__(self, corpo):
        self._corpo = json.dumps(corpo).encode('utf-8')

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class CA1RotaTest(TestCase):
    def test_rota_valida_retorna_200_com_distancia_e_linestring(self):
        with patch.dict('os.environ', {'OSRM_BASE_URL': URL_OSRM}), patch.object(
            views, 'urlopen', return_value=RespostaFalsa(RESPOSTA_OK)
        ) as chamada:
            resposta = self.client.get('/api/rota/?de=-41.0,-2.9&ate=-40.8,-2.7')

        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertGreater(dados['distancia_m'], 0)
        self.assertEqual(dados['distancia_m'], 1234.5)
        self.assertEqual(dados['geometria']['type'], 'LineString')
        self.assertGreaterEqual(len(dados['geometria']['coordinates']), 2)
        self.assertNotIn('duracao', dados)
        self.assertNotIn('duration', dados)

        url = chamada.call_args.args[0]
        self.assertTrue(url.startswith(f'{URL_OSRM}/route/v1/driving/'))
        self.assertIn('-41.0,-2.9;-40.8,-2.7', url)
        self.assertIn('overview=full', url)
        self.assertIn('geometries=geojson', url)

    def test_base_url_padrao_e_o_osrm_publico(self):
        self.assertEqual(views.OSRM_URL_PADRAO, 'https://router.project-osrm.org')
