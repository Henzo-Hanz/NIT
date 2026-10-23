import shutil
import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from unittest.mock import patch
from urllib.error import URLError

from biodiversidade import views

SLUG = 'caranguejo-uca'


class HelpersPhylopicTest(TestCase):
    def test_uuid_de_href_extrai_uuid(self):
        self.assertEqual(
            views._uuid_de_href('/nodes/f10e8008-99c6-47eb-88bc-1d1245d24929?build=560'),
            'f10e8008-99c6-47eb-88bc-1d1245d24929',
        )
        self.assertIsNone(views._uuid_de_href(None))
        self.assertIsNone(views._uuid_de_href('/nodes/?build=560'))

    def test_procurar_imagem_por_nomes_tenta_escada_de_nomes(self):
        respostas = [
            {'build': 560},
            {
                '_links': {
                    'items': [{'href': '/nodes/aaaaaaaa-0000-0000-0000-000000000000?build=560', 'title': 'A'}]
                }
            },
            {
                '_embedded': {
                    'items': [
                        {
                            'uuid': 'bbbbbbbb-0000-0000-0000-000000000000',
                            '_links': {'vectorFile': {'href': 'https://images/vector1.svg'}},
                        }
                    ]
                }
            },
        ]

        def pegar_json_fake(_url):
            return respostas.pop(0)

        with patch.object(views, '_pegar_json', side_effect=pegar_json_fake):
            self.assertEqual(
                views._procurar_imagem_por_nomes(['x y', 'Brachyura']),
                'https://images/vector1.svg',
            )

    def test_procurar_imagem_por_nomes_pula_no_sem_sucesso(self):
        respostas = [
            {'build': 560},
            {'_links': {'items': []}},
            {'_links': {'items': [{'href': '/nodes/dddddddd-0000-0000-0000-000000000000', 'title': 'Outro'}]}},
            {'_embedded': {'items': []}},
            {'_embedded': {'primaryImage': {'_links': {'vectorFile': {'href': 'https://images/vector2.svg'}}}}},
        ]

        def pegar_json_fake(_url):
            return respostas.pop(0)

        with patch.object(views, '_pegar_json', side_effect=pegar_json_fake):
            self.assertEqual(
                views._procurar_imagem_por_nomes(['algum', 'outro']),
                'https://images/vector2.svg',
            )

    def test_preferidas_por_nome_sao_respeitadas(self):
        respostas = [
            {'build': 560},
            {
                '_links': {
                    'items': [
                        {
                            'href': '/nodes/8880ea7d-e9cb-4104-b0d7-8ca2c45e4a30?build=560',
                            'title': 'Cancer',
                        }
                    ]
                }
            },
        ]

        def pegar_json_fake(_url):
            return respostas.pop(0)

        with patch.object(views, '_pegar_json', side_effect=pegar_json_fake):
            self.assertEqual(
                views._procurar_imagem_por_nomes(['cancer']),
                f'{views.URL_VETOR_BASE}/{views.ICONES_PREFERIDOS["cancer"]}/vector.svg',
            )


class CA9IconeEspecieTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())
        self.pasta_uuid = views.RAIZ_APP / 'midia' / 'icones-teste'
        views.PASTA_ICONES.mkdir(parents=True, exist_ok=True)
        self.pasta_original = views.PASTA_ICONES
        views.PASTA_ICONES = self.pasta_uuid

    def tearDown(self):
        views.PASTA_ICONES = self.pasta_original
        shutil.rmtree(self.pasta_uuid, ignore_errors=True)

    def test_icone_baixado_e_servido_com_svg_e_cache_sem_nova_busca(self):
        conteudo = b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="9"/></svg>'

        def baixar_fake(_url, destino):
            destino.write_bytes(conteudo)

        def procurar_fake(nomes):
            self.assertIn('cancer', nomes)
            self.assertIn('brachyura', nomes)
            self.assertIn('Ucides cordatus', nomes)
            return 'https://images/vector.svg'

        patchers = [
            patch.object(views, '_procurar_imagem_por_nomes', side_effect=procurar_fake),
            patch.object(views, '_baixar_arquivo', side_effect=baixar_fake),
        ]
        with patchers[0], patchers[1]:
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
            self.assertEqual(resposta.status_code, 200)
            self.assertEqual(resposta['Content-Type'], 'image/svg+xml')
            self.assertEqual(resposta.getvalue(), conteudo)

        def procurar_que_nao_deve_ser_chamado(_nomes):
            raise AssertionError('cache em disco não foi usado')

        with patch.object(views, '_procurar_imagem_por_nomes', side_effect=procurar_que_nao_deve_ser_chamado):
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
            self.assertEqual(resposta.status_code, 200)

    def test_slug_inexistente_retorna_404_sem_baixar_nada(self):
        resposta = self.client.get('/api/especies/tirano-rex-austrial/icone/')
        self.assertEqual(resposta.status_code, 404)

    def test_sem_imagem_encontrada_na_api_retorna_404(self):
        with patch.object(views, '_procurar_imagem_por_nomes', return_value=None):
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
            self.assertEqual(resposta.status_code, 404)

    def test_erro_de_rede_na_busca_retorna_404(self):
        with patch.object(views, '_procurar_imagem_por_nomes', side_effect=URLError('fora do ar')):
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
            self.assertEqual(resposta.status_code, 404)
        self.assertFalse(
            (self.pasta_uuid / f'{SLUG}.svg').exists(),
            'arquivo vazio ou parcial não deve restar no cache',
        )
