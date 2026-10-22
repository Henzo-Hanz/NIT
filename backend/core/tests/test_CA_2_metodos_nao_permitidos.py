from django.test import TestCase


class CA2PingMetodosNaoPermitidosTest(TestCase):
    def _post_e_405(self, metodo, corpo):
        resposta = getattr(self.client, metodo)('/api/ping/', corpo, content_type='application/json')
        self.assertEqual(resposta.status_code, 405)
        self.assertIn('GET', resposta['Allow'])

    def test_post_retorna_405(self):
        self._post_e_405('post', {})

    def test_put_retorna_405(self):
        self._post_e_405('put', {})

    def test_patch_retorna_405(self):
        self._post_e_405('patch', {})

    def test_delete_retorna_405(self):
        resposta = self.client.delete('/api/ping/')
        self.assertEqual(resposta.status_code, 405)
        self.assertIn('GET', resposta['Allow'])
