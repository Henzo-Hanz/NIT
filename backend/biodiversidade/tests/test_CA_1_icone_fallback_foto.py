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


class CA1IconeFallbackFotoTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_icone_permutado_para_imagem_de_todas_as_especies_com_foto(self):
        # Lapidação 7 (SPEC-0005): sem silhueta na PhyloPic, /icone/ aponta
        # o browser para /imagem/ (fallback da ficha, raro); a foto real
        # continua como primário da ficha (FotoEspecie).
        for especie in Especie.objects.exclude(imagem=''):
            with self.subTest(especie=especie.slug):
                caminho_foto = RAIZ_APP / especie.imagem.removeprefix('biodiversidade/')
                self.assertTrue(caminho_foto.is_file())
                with patch.object(
                    views, '_procurar_imagem_por_nomes', return_value=None
                ):
                    resposta = self.client.get(f'/api/especies/{especie.slug}/icone/')
                self.assertEqual(resposta.status_code, 302)
                self.assertEqual(
                    resposta['Location'], f'/api/especies/{especie.slug}/imagem/'
                )

                imagem = self.client.get(f'/api/especies/{especie.slug}/imagem/')
                tipo, _ = mimetypes.guess_type(caminho_foto.name)
                self.assertEqual(imagem.status_code, 200)
                self.assertEqual(imagem['Content-Type'], tipo)
