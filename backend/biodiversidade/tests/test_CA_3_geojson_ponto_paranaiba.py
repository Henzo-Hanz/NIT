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
        # Lapidação 8 (SPEC-0005): 1 linha sem espécie + 1 por espécie demo
        # (premissa do dono, reversível) — todas sem 'total' (lapidação 4).
        self.assertEqual(len(paranaiba), 3)
        self.assertEqual({f['properties']['tipo'] for f in paranaiba}, {'ponto'})
        self.assertTrue(all('total' not in f['properties'] for f in paranaiba))
        self.assertEqual(
            {f['properties']['descricao'] for f in paranaiba},
            {DESCRICAO_PARNAIBA},
        )
        self.assertEqual({f['geometry']['type'] for f in paranaiba}, {'Point'})
