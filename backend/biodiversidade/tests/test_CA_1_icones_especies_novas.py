import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from biodiversidade import views
from django.core.management import call_command
from django.test import TestCase

ESPECIES_NOVAS = {
    'badejo': 'Mycteroperca bonaci',
    'garoupa': 'Epinephelus marginatus',
    'robalo-peva': 'Centropomus parallelus',
    'trinta-reis': 'Thalasseus acuflavidus',
    'atoba': 'Sula leucogaster',
}
CONTEUDO_SVG = b'<svg xmlns="http://www.w3.org/2000/svg"/>'


class CA1IconesEspeciesNovasTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())
        self.pasta_temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta_temp.cleanup)

    def _get_icone(self, slug, url_vetor='https://exemplo.test/vector.svg'):
        nomes_recebidos = []

        def procurar_fake(nomes):
            nomes_recebidos.extend(nomes)
            return url_vetor

        def baixar_fake(_url, destino):
            destino.write_bytes(CONTEUDO_SVG)

        with (
            patch.object(views, 'PASTA_ICONES', Path(self.pasta_temp.name)),
            patch.object(
                views, '_procurar_imagem_por_nomes', side_effect=procurar_fake
            ),
            patch.object(views, '_baixar_arquivo', side_effect=baixar_fake),
        ):
            resposta = self.client.get(f'/api/especies/{slug}/icone/')
        return resposta, nomes_recebidos

    def test_icone_das_especies_novas_e_servido_como_svg(self):
        for slug, nome_cientifico in ESPECIES_NOVAS.items():
            with self.subTest(slug=slug):
                resposta, nomes = self._get_icone(slug)
                self.assertEqual(resposta.status_code, 200)
                self.assertEqual(resposta['Content-Type'], 'image/svg+xml')
                self.assertEqual(b''.join(resposta.streaming_content), CONTEUDO_SVG)
                self.assertTrue(nomes)
                self.assertEqual(nomes[0], nome_cientifico)

    def test_especie_nova_sem_vetor_retorna_404(self):
        with (
            patch.object(views, 'PASTA_ICONES', Path(self.pasta_temp.name)),
            patch.object(views, '_procurar_imagem_por_nomes', return_value=None),
        ):
            resposta = self.client.get('/api/especies/badejo/icone/')
        self.assertEqual(resposta.status_code, 404)
