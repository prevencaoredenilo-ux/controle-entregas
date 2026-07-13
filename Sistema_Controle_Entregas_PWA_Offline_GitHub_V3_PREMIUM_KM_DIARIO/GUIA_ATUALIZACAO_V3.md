# Como atualizar para a V3 Premium

## O que muda

A V3 separa corretamente duas coisas:

1. **Ciclo** = uma saída da loja até o retorno.
2. **KM diário** = KM inicial no começo do dia e KM final no encerramento de cada veículo.

Com isso, o sistema calcula automaticamente:

- KM total do dia;
- KM total da semana;
- KM total do mês;
- KM total do ano;
- média de KM por dia;
- média de KM por ciclo;
- KM por entrega;
- custo por KM;
- entregas por ciclo.

## Para atualizar no GitHub Pages

1. Faça um backup dos dados no app atual.
2. Extraia o ZIP da V3.
3. No mesmo repositório do GitHub, substitua os arquivos antigos pelos arquivos da V3.
4. Faça o commit das alterações.
5. Aguarde a publicação automática do GitHub Pages.
6. Abra o app e force a atualização do navegador se necessário.

## Compatibilidade com a V2

A V3 mantém o mesmo banco local. Os registros antigos continuam sendo lidos.

Se existirem ciclos antigos com KM inicial e final preenchidos, a V3 tenta criar automaticamente um fechamento diário por veículo usando o menor KM inicial e o maior KM final daquele dia, somente quando ainda não existe um fechamento diário correspondente.

## Rotina correta de uso do KM

### No começo do dia

Abra **Operação do dia** e, no card do veículo, clique em **Registrar KM inicial**.

### Durante o dia

Registre os ciclos normalmente. Você não precisa informar KM em cada ciclo.

### No fim do dia

Abra novamente o card do veículo e informe o **KM final**.

O app calcula automaticamente todas as médias.
