from io import StringIO
from unittest.mock import patch

from biodiversidade import views
from biodiversidade.models import Especie
from django.core.management import call_command
from django.test import TestCase

ESPECIES_NOVAS = {
    'badejo': 'Mycteroperca bonaci',
    'garoupa': 'Epinephelus marginatus',
    'robalo-peva': 'Centropomus parallelus',
    'trinta-reis': 'Thalasseus acuflavidus',
    'atoba': 'Sula leucogaster',
}


class CA1IconesEspeciesNovasTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_icone_das_especies_novas_redireciona_ao_vetor_on_demand(self):
        vetor = 'https://exemplo.test/vector.svg'
        for slug, nome_cientifico in ESPECIES_NOVAS.items():
            with self.subTest(slug=slug):
                nomes_recebidos = []

                def procurar_fake(nomes):
                    nomes_recebidos.extend(nomes)
                    return vetor

                with patch.object(
                    views, '_procurar_imagem_por_nomes', side_effect=procurar_fake
                ):
                    resposta = self.client.get(f'/api/especies/{slug}/icone/')
                self.assertEqual(resposta.status_code, 302)
                self.assertEqual(resposta['Location'], vetor)
                self.assertEqual(resposta['Cache-Control'], 'max-age=300')
                self.assertTrue(nomes_recebidos)
                self.assertEqual(nomes_recebidos[0], nome_cientifico)

    def test_especie_transitoria_sem_vetor_nem_foto_retorna_404(self):
        # Lapidação 7 (SPEC-0005): sem silhueta na PhyloPic, o fallback é a
        # foto servida por /imagem/; sem silhueta e sem foto → 404.
        Especie.objects.create(
            slug='especie-transitoria',
            nome_popular='Espécie transitória',
            nome_cientifico=None,
            imagem='',
        )
        with patch.object(views, '_procurar_imagem_por_nomes', return_value=None):
            resposta = self.client.get('/api/especies/especie-transitoria/icone/')
        self.assertEqual(resposta.status_code, 404)
