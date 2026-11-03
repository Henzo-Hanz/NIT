from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from biodiversidade.models import Especie


class CA3BuscaTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def _get(self, query=None):
        return self.client.get('/api/consulta/busca/', query or {})

    def test_mancha_parcial_pelo_nome_popular(self):
        resposta = self._get({'q': 'bade'})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(
            dados['especies'], [{'slug': 'badejo', 'nome_popular': 'Badejo'}]
        )
        features = dados['pontos']['features']
        self.assertEqual(
            [feature['properties']['nome'] for feature in features],
            ['Itamaracá', 'Porto de Galinhas', 'Recife', 'Tamandaré'],
        )
        for feature in features:
            propriedades = feature['properties']
            self.assertEqual(propriedades['busca_slugs'], ['badejo'])
            self.assertIn('badejo', propriedades['especie_slugs'])
            for chave in ('id', 'nome', 'descricao', 'especie_slugs', 'total'):
                self.assertIn(chave, propriedades)

    def test_case_insensitive_como_prefixo(self):
        resposta = self._get({'q': 'BADEJO'})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(
            [item['slug'] for item in dados['especies']], ['badejo']
        )
        self.assertEqual(
            [feature['properties']['nome'] for feature in dados['pontos']['features']],
            ['Itamaracá', 'Porto de Galinhas', 'Recife', 'Tamandaré'],
        )

    def test_busca_por_nome_cientifico(self):
        resposta = self._get({'q': 'epinephelus'})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(
            dados['especies'], [{'slug': 'garoupa', 'nome_popular': 'Garoupa'}]
        )
        self.assertEqual(
            [feature['properties']['nome'] for feature in dados['pontos']['features']],
            ['Porto de Galinhas', 'Recife', 'Tamandaré'],
        )
        self.assertTrue(
            all(
                feature['properties']['busca_slugs'] == ['garoupa']
                for feature in dados['pontos']['features']
            )
        )

    def test_ponto_pelo_nome_traz_especies_do_ponto_sem_match_fts(self):
        # Lapidação 8 (SPEC-0005): o ponto do Parnaíba tem espécies demo
        # (reversível); aqui nenhuma casa com o FTS do termo, então o grupo
        # só bate pelo nome (icontains) e busca_slugs fica vazio. Sem
        # número mockado (lapidação 4): 'total' = contagem real da view.
        resposta = self._get({'q': 'Parnaíba'})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(dados['especies'], [])
        features = dados['pontos']['features']
        self.assertEqual(len(features), 1)
        propriedades = features[0]['properties']
        self.assertEqual(propriedades['nome'], 'Parnaíba')
        self.assertEqual(
            propriedades['especie_slugs'],
            ['caranguejo-uca', 'caranguejeiro-laranja-do-norte'],
        )
        self.assertEqual(propriedades['total'], len(propriedades['especie_slugs']))
        self.assertEqual(propriedades['busca_slugs'], [])

    def test_pontos_ordenados_por_correspondencias_e_nome(self):
        resposta = self._get({'q': 'caranguejo'})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        slugs = sorted(item['slug'] for item in dados['especies'])
        self.assertEqual(
            slugs, ['caranguejo-maria-farinha', 'caranguejo-uca']
        )
        ordem_no_rank = [item['slug'] for item in dados['especies']]
        features = dados['pontos']['features']
        self.assertEqual(
            [feature['properties']['nome'] for feature in features],
            ['Camocim', 'Jericoacoara', 'Luís Correia', 'Parnaíba'],
        )
        # Lapidação 8 (SPEC-0005): o Parnaíba entra com 1 correspondência
        # (uca) e cai depois dos pontos com mais matches, no fim ordenado
        # por nome.
        por_nome = {
            feature['properties']['nome']: feature['properties']
            for feature in features
        }
        self.assertEqual(
            por_nome['Camocim']['busca_slugs'], ordem_no_rank
        )
        self.assertEqual(
            por_nome['Jericoacoara']['busca_slugs'],
            ['caranguejo-uca'],
        )
        self.assertEqual(
            por_nome['Luís Correia']['busca_slugs'],
            ['caranguejo-uca'],
        )
        self.assertEqual(
            por_nome['Parnaíba']['busca_slugs'],
            ['caranguejo-uca'],
        )

    def test_consulta_sem_resultado_retorna_200_vazio(self):
        resposta = self._get({'q': 'zezinho'})
        self.assertEqual(resposta.status_code, 200)
        dados = resposta.json()
        self.assertEqual(dados['especies'], [])
        self.assertEqual(dados['pontos']['features'], [])
        self.assertEqual(dados['pontos']['type'], 'FeatureCollection')

    def test_termo_ausente_ou_inutil_retorna_400(self):
        casos = [None, '', '   ', '—', '___', '!!!']
        for termo in casos:
            with self.subTest(termo=termo):
                resposta = self._get({} if termo is None else {'q': termo})
                self.assertEqual(resposta.status_code, 400)
                self.assertIn('erro', resposta.json())

    def test_atualizacao_de_nome_popular_e_indexada_pelos_triggers(self):
        especie = Especie.objects.get(slug='badejo')
        especie.nome_popular = 'Peixe-espada'
        especie.save()

        resposta = self._get({'q': 'espada'})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(
            resposta.json()['especies'],
            [{'slug': 'badejo', 'nome_popular': 'Peixe-espada'}],
        )
        resposta = self._get({'q': 'badejo'})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json()['especies'], [])
        self.assertEqual(resposta.json()['pontos']['features'], [])
