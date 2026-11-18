from unittest.mock import patch

from django.test import TestCase

from biodiversidade import views

CASOS_INVALIDOS = {
    'sem_parametros': {},
    'sem_de': {'ate': '-40.8,-2.7'},
    'sem_ate': {'de': '-41.0,-2.9'},
    'texto': {'de': 'abc', 'ate': '-40.8,-2.7'},
    'tres_partes': {'de': '1,2,3', 'ate': '-40.8,-2.7'},
    'lon_fora_da_faixa': {'de': '-181,-2.9', 'ate': '-40.8,-2.7'},
    'lat_fora_da_faixa': {'de': '-41,-91', 'ate': '-40.8,-2.7'},
    'lat_fora_no_ate': {'de': '-41,-2.9', 'ate': '-40.8,91'},
    'vazio': {'de': '', 'ate': '-40.8,-2.7'},
}


class CA2RotaValidacaoTest(TestCase):
    def test_entrada_invalida_retorna_400_sem_chamar_o_osrm(self):
        for nome, params in CASOS_INVALIDOS.items():
            with self.subTest(caso=nome):
                with patch.object(views, 'urlopen') as chamada:
                    resposta = self.client.get('/api/rota/', params)
                self.assertEqual(resposta.status_code, 400)
                self.assertIn('erro', resposta.json())
                chamada.assert_not_called()
