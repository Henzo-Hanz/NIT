from io import StringIO

from django.core.management import call_command
from django.test import TestCase

# Lapidação 10 (SPEC-0005): grupo por espécie (resumo/detalhe) + busca FTS
# na lista (?q=, mesma semântica do mapa). Crustáceos recebem 'grupo' no
# seed (premissa do runner, reversível); peixes/aves já tinham. Fallback
# serializers: infos sem 'grupo' → 'Crustáceo' (dados antigos).
CRUSTACEOS = {
    'caranguejo-uca',
    'caranguejo-maria-farinha',
    'caranguejeiro-laranja-do-norte',
    'guaiamum',
    'aratu',
    'siri-azul',
}
PEIXES = {'badejo', 'garoupa', 'robalo-peva'}
AVES = {'trinta-reis', 'atoba'}


class CA5ListaGrupoBuscaTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def _get(self, query=None):
        return self.client.get('/api/especies/', query or {})

    def test_lista_expoe_grupo_por_espécie(self):
        resposta = self._get()
        self.assertEqual(resposta.status_code, 200)
        itens = resposta.json()
        grupos = {item['slug']: item['grupo'] for item in itens}
        self.assertEqual(len(itens), 11)
        for slug in CRUSTACEOS:
            with self.subTest(slug=slug):
                self.assertEqual(grupos[slug], 'Crustáceo')
        for slug in PEIXES:
            with self.subTest(slug=slug):
                self.assertEqual(grupos[slug], 'Peixe')
        for slug in AVES:
            with self.subTest(slug=slug):
                self.assertEqual(grupos[slug], 'Ave')

    def test_busca_na_lista_pelo_nome_popular(self):
        resposta = self._get({'q': 'maria'})
        self.assertEqual(resposta.status_code, 200)
        itens = resposta.json()
        self.assertEqual(
            [item['slug'] for item in itens],
            ['caranguejo-maria-farinha'],
        )
        self.assertEqual(itens[0]['grupo'], 'Crustáceo')

    def test_busca_na_lista_pelo_nome_cientifico(self):
        resposta = self._get({'q': 'Ucides'})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(
            [item['slug'] for item in resposta.json()],
            ['caranguejo-uca'],
        )

    def test_busca_na_lista_sem_match_retorna_lista_vazia(self):
        resposta = self._get({'q': 'zezinho'})
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta.json(), [])
