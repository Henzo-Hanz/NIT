from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class QueryGeometriasTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_geojson_usa_uma_consulta_com_select_related(self):
        with self.assertNumQueries(1):
            resposta = self.client.get('/api/geometrias/')
        self.assertEqual(resposta.status_code, 200)
