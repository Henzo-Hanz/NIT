from django.test import TestCase


class CA2Imagem404Test(TestCase):
    def test_slug_inexistente_retorna_404(self):
        resposta = self.client.get('/api/especies/slug-inexistente/imagem/')
        self.assertEqual(resposta.status_code, 404)
