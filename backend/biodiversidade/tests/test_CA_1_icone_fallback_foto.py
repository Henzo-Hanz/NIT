import tempfile
import mimetypes
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import biodiversidade
from biodiversidade import views
from biodiversidade.models import Especie
from django.core.management import call_command
from django.test import TestCase

RAIZ_APP = Path(biodiversidade.__file__).resolve().parent

# Lapidação 6 (SPEC-0005): as 7 espécies que receberam foto em midia/.
ESPECIES_COM_FOTO = (
    'aratu',
    'siri-azul',
    'badejo',
    'garoupa',
    'robalo-peva',
    'trinta-reis',
    'atoba',
)


class CA1IconeFallbackFotoTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())
        self.pasta_temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta_temp.cleanup)

    def test_foto_de_cada_especie_e_servida_quando_sem_silhueta(self):
        for especie in Especie.objects.filter(slug__in=ESPECIES_COM_FOTO):
            with self.subTest(especie=especie.slug):
                caminho_foto = RAIZ_APP / especie.imagem.removeprefix('biodiversidade/')
                with (
                    patch.object(views, 'PASTA_ICONES', Path(self.pasta_temp.name)),
                    patch.object(
                        views, '_procurar_imagem_por_nomes', return_value=None
                    ),
                ):
                    resposta = self.client.get(f'/api/especies/{especie.slug}/icone/')
                tipo, _ = mimetypes.guess_type(caminho_foto.name)
                self.assertEqual(resposta.status_code, 200)
                self.assertEqual(resposta['Content-Type'], tipo)
                self.assertTrue(resposta['Content-Type'].startswith('image/'))
                self.assertEqual(
                    b''.join(resposta.streaming_content), caminho_foto.read_bytes()
                )
