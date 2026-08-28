# Guia de atualização para a V4

## O que foi corrigido

A V4 separa definitivamente duas coisas diferentes:

1. **Quilometragem diária do veículo**
   - KM inicial: antes de começar o expediente.
   - KM final: ao terminar o expediente.
   - KM rodado no dia = KM final - KM inicial.

2. **Ciclos de entrega**
   - 1 ciclo = 1 saída da loja até 1 retorno ao mercado.
   - Uma saída pode levar uma ou várias entregas.
   - Todas as entregas levadas juntas recebem o mesmo ciclo.

Com isso, o sistema calcula automaticamente:

- KM total por dia, semana, mês, ano e período personalizado;
- KM médio por ciclo;
- KM por entrega;
- entregas levadas por ciclo;
- média de ciclos por dia;
- tempo médio dos ciclos.

## Como atualizar seu GitHub Pages

1. Abra seu app atual e faça um **Backup JSON**.
2. Extraia o ZIP da V4.
3. Entre no mesmo repositório do GitHub.
4. Substitua os arquivos antigos pelos arquivos da V4.
5. Faça o commit.
6. Aguarde a publicação do GitHub Pages.
7. Abra o app e use `Ctrl + F5` no computador, caso o navegador ainda mostre arquivos antigos.

## Compatibilidade com dados anteriores

A V4 mantém o mesmo banco IndexedDB e o mesmo nome de base. Ao atualizar no mesmo endereço do GitHub Pages e no mesmo navegador, os registros anteriores continuam disponíveis.

Por segurança, faça backup antes da atualização.
