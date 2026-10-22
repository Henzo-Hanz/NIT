from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class QueryEspeciesTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_lista_usa_uma_consulta(self):
        with self.assertNumQueries(1):
            resposta = self.client.get('/api/especies/')
        self.assertEqual(resposta.status_code, 200)

    def test_detalhe_usa_uma_consulta(self):
        with self.assertNumQueries(1):
            resposta = self.client.get('/api/especies/caranguejo-uca/')
        self.assertEqual(resposta.status_code, 200)
