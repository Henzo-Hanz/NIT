from io import StringIO
from pathlib import Path

import biodiversidade
from biodiversidade.models import Especie
from django.core.management import call_command
from django.test import TestCase

RAIZ_APP = Path(biodiversidade.__file__).resolve().parent


# Lapidação 6 (SPEC-0005): só o guaiamum ficou sem foto; as demais 10
# espécies do seed apontam arquivos em midia/.
SLUGS_SEM_FOTO = ('guaiamum',)


class CA6PlaceholdersMidiaTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_cada_especie_com_imagem_referencia_placeholder_existente_e_nao_vazio(self):
        self.assertEqual(Especie.objects.exclude(imagem='').count(), 10)
        for especie in Especie.objects.exclude(imagem=''):
            with self.subTest(especie=especie.slug):
                caminho = RAIZ_APP / especie.imagem.removeprefix('biodiversidade/')
                self.assertTrue(caminho.is_file(), f'faltando {caminho}')
                self.assertGreater(caminho.stat().st_size, 0)

    def test_especies_mock_novas_ficam_sem_imagem(self):
        for slug in SLUGS_SEM_FOTO:
            with self.subTest(especie=slug):
                self.assertEqual(Especie.objects.get(slug=slug).imagem, '')
