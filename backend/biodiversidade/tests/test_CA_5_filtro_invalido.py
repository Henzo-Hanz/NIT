import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase


class CA5FiltroInvalidoTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_tipo_invalido_retorna_400_com_erro_explicando_validos(self):
        resposta = self.client.get('/api/geometrias/?tipo=galaxia')
        self.assertEqual(resposta.status_code, 400)
        dados = json.loads(resposta.content)
        self.assertIn('erro', dados)
        for tipo_valido in ('ponto', 'linha', 'poligono'):
            self.assertIn(tipo_valido, dados['erro'])
