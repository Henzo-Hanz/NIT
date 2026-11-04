import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from unittest.mock import patch
from urllib.error import URLError

from biodiversidade import views
from biodiversidade.models import Especie

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
    # Lapidação 7 (SPEC-0005), premissa do dono: on demand é APENAS para os
    # pins do mapa (consumidor único). A view não grava/serva estático; o
    # consumidor do endpoint /icone/ recebe 302 e busca a imagem na hora.
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def _arquivos_do_cache_publico(self):
        pasta = views.RAIZ_APP / 'midia' / 'icones'
        return {str(caminho) for caminho in pasta.glob('*')} if pasta.is_dir() else set()

    def test_resolucao_ok_redireciona_ao_vetor_on_demand_sem_gravar_arquivo(self):
        vetor = 'https://images.phylopic.test/vetor-on-demand.svg'
        respostas = [
            {'build': 560},
            {
                '_links': {
                    'items': [{'href': '/nodes/11111111-0000-0000-0000-000000000000?build=560', 'title': 'Ucides'}]
                }
            },
            {
                '_embedded': {
                    'items': [
                        {
                            'uuid': '22222222-0000-0000-0000-000000000000',
                            '_links': {'vectorFile': {'href': vetor}},
                        }
                    ]
                }
            },
        ]

        def pegar_json_fake(_url):
            return respostas.pop(0)

        antes = self._arquivos_do_cache_publico()
        with patch.object(views, '_pegar_json', side_effect=pegar_json_fake):
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
        self.assertEqual(resposta.status_code, 302)
        self.assertEqual(resposta['Location'], vetor)
        self.assertEqual(resposta['Cache-Control'], 'max-age=300')
        self.assertEqual(self._arquivos_do_cache_publico(), antes, 'nenhum arquivo deve ser gravado em disco')

    def test_preferidos_redirecionam_ao_vetor_do_uuid(self):
        respostas = [
            {'build': 560},
            {'_links': {'items': []}},
            {'_links': {'items': []}},
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
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
        self.assertEqual(resposta.status_code, 302)
        self.assertEqual(
            resposta['Location'],
            f'{views.URL_VETOR_BASE}/{views.ICONES_PREFERIDOS["cancer"]}/vector.svg',
        )

    def test_sem_silhueta_e_com_foto_cai_para_o_redirect_da_imagem(self):
        with patch.object(views, '_procurar_imagem_por_nomes', return_value=None):
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
        self.assertEqual(resposta.status_code, 302)
        self.assertTrue(resposta['Location'].endswith(f'/api/especies/{SLUG}/imagem/'))

    def test_sem_silhueta_e_sem_foto_retorna_404(self):
        # O seed agora dá foto às espécies: o cenário 404 exige registro
        # transitório sem imagem em midia/.
        Especie.objects.create(
            slug='especie-transitoria',
            nome_popular='Espécie transitória',
            nome_cientifico=None,
            imagem='',
        )
        with patch.object(views, '_procurar_imagem_por_nomes', return_value=None):
            resposta = self.client.get('/api/especies/especie-transitoria/icone/')
        self.assertEqual(resposta.status_code, 404)

    def test_slug_inexistente_retorna_404(self):
        resposta = self.client.get('/api/especies/tirano-rex-austrial/icone/')
        self.assertEqual(resposta.status_code, 404)

    def test_erro_de_rede_toca_o_mesmo_fallback(self):
        with patch.object(
            views, '_procurar_imagem_por_nomes', side_effect=URLError('fora do ar')
        ):
            resposta = self.client.get(f'/api/especies/{SLUG}/icone/')
        self.assertEqual(resposta.status_code, 302)
        self.assertTrue(resposta['Location'].endswith(f'/api/especies/{SLUG}/imagem/'))

        Especie.objects.create(
            slug='especie-rede-fora',
            nome_popular='Espécie rede fora',
            nome_cientifico=None,
            imagem='',
        )
        with patch.object(
            views, '_procurar_imagem_por_nomes', side_effect=URLError('fora do ar')
        ):
            resposta = self.client.get('/api/especies/especie-rede-fora/icone/')
        self.assertEqual(resposta.status_code, 404)
