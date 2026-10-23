from io import StringIO

from django.core.management import call_command
from django.test import TestCase

ESPECIES = ('caranguejo-uca', 'caranguejo-maria-farinha', 'caranguejeiro-laranja-do-norte')


class CA1ImagemEspecieTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_imagem_de_cada_especie_retorna_200_com_svg(self):
        for slug in ESPECIES:
            with self.subTest(slug=slug):
                resposta = self.client.get(f'/api/especies/{slug}/imagem/')
                self.assertEqual(resposta.status_code, 200)
                self.assertTrue(resposta['Content-Type'].startswith('image/svg+xml'))
