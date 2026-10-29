import json
from io import StringIO

from biodiversidade.models import Geometria
from django.core.management import call_command
from django.test import TestCase

SLUGS_NOVOS = {'guaiamum', 'aratu', 'siri-azul'}
LON_MIN, LON_MAX = -42, -38
LAT_MIN, LAT_MAX = -5, -2.5


class CA1AreaSeedPontosTest(TestCase):
    def setUp(self):
        call_command('seed_demo', '--recriar', stdout=StringIO())

    def test_geometrias_tem_pontos_com_especie_no_litoral_ce_pi(self):
        resposta = self.client.get('/api/geometrias/')
        self.assertEqual(resposta.status_code, 200)
        dados = json.loads(resposta.content)
        pontos = [
            feature
            for feature in dados['features']
            if feature['properties']['tipo'] == 'ponto'
            and feature['properties']['especie_slug'] is not None
        ]
        self.assertGreaterEqual(len(pontos), 3)
        for ponto in pontos:
            with self.subTest(nome=ponto['properties']['nome']):
                self.assertEqual(ponto['geometry']['type'], 'Point')
                longitudes, latitudes = ponto['geometry']['coordinates']
                self.assertGreaterEqual(longitudes, LON_MIN)
                self.assertLessEqual(longitudes, LON_MAX)
                self.assertGreaterEqual(latitudes, LAT_MIN)
                self.assertLessEqual(latitudes, LAT_MAX)

    def test_seed_nao_contem_geometrias_de_linha_ou_poligono(self):
        self.assertFalse(
            Geometria.objects.filter(tipo__in=('linha', 'poligono')).exists()
        )

    def test_ponto_paranaiba_permanece_no_seed_com_total_223(self):
        resposta = self.client.get('/api/geometrias/')
        self.assertEqual(resposta.status_code, 200)
        dados = json.loads(resposta.content)
        paranaiba = [
            feature
            for feature in dados['features']
            if feature['properties']['nome'] == 'Parnaíba'
        ]
        self.assertEqual(len(paranaiba), 1)
        propriedades = paranaiba[0]['properties']
        self.assertEqual(propriedades['tipo'], 'ponto')
        self.assertEqual(propriedades['especie_slug'], None)
        self.assertEqual(propriedades['total'], 223)

    def test_especies_lista_contem_os_tres_slugs_novos(self):
        resposta = self.client.get('/api/especies/')
        self.assertEqual(resposta.status_code, 200)
        slugs = {item['slug'] for item in json.loads(resposta.content)}
        self.assertTrue(SLUGS_NOVOS.issubset(slugs))

    def test_seed_sem_recriar_nao_duplica_pontos(self):
        call_command('seed_demo', stdout=StringIO())
        pontos = Geometria.objects.filter(tipo='ponto', especie__isnull=False)
        self.assertEqual(pontos.count(), 7)
        self.assertEqual(pontos.values('nome').distinct().count(), 3)
