import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class CA2DetalheEspecieTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_detalhe_uca_retorna_200_com_campos_completos(self):
        resposta = self.client.get('/api/especies/caranguejo-uca/')
        self.assertEqual(resposta.status_code, 200)
        dados = json.loads(resposta.content)
        self.assertEqual(dados['nome_popular'], 'Caranguejo-uçá')
        self.assertEqual(dados['nome_cientifico'], 'Ucides cordatus')
        self.assertIsInstance(dados['descricao'], str)
        self.assertIsInstance(dados['infos'], dict)
        self.assertTrue(dados['imagem'].endswith('caranguejo-uca.png'))

    def test_detalhe_slug_inexistente_retorna_404(self):
        resposta = self.client.get('/api/especies/slug-inexistente/')
        self.assertEqual(resposta.status_code, 404)
