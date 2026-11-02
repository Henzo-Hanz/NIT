import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase


DESCRICAO_PARNAIBA = 'Ponto amostral de caranguejos em Parnaíba (PI)'


class CA3GeojsonPontoParanaibaTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_featurecollection_tem_ponto_paranaiba_sem_total_mock(self):
        resposta = self.client.get('/api/geometrias/')
        self.assertEqual(resposta.status_code, 200)
        dados = json.loads(resposta.content)
        self.assertEqual(dados['type'], 'FeatureCollection')
        paranaiba = [
            f for f in dados['features'] if f['properties']['nome'] == 'Parnaíba'
        ]
        self.assertEqual(len(paranaiba), 1)
        propriedades = paranaiba[0]['properties']
        self.assertEqual(propriedades['tipo'], 'ponto')
        self.assertNotIn('total', propriedades)
        self.assertEqual(propriedades['descricao'], DESCRICAO_PARNAIBA)
        self.assertEqual(paranaiba[0]['geometry']['type'], 'Point')
