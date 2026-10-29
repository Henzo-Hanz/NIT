import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class CA1ListaEspeciesTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_lista_retorna_200_com_as_especies_originais_e_campos_basicos(self):
        resposta = self.client.get('/api/especies/')
        self.assertEqual(resposta.status_code, 200)
        dados = json.loads(resposta.content)
        slugs = {item['slug'] for item in dados}
        self.assertTrue(
            {
                'caranguejo-uca',
                'caranguejo-maria-farinha',
                'caranguejeiro-laranja-do-norte',
            }.issubset(slugs)
        )
        for item in dados:
            self.assertIn('nome_popular', item)
            self.assertIn('nome_cientifico', item)
            self.assertIn('imagem', item)
        sem_cientifico = [item for item in dados if item['nome_cientifico'] is None]
        self.assertEqual(len(sem_cientifico), 1)
