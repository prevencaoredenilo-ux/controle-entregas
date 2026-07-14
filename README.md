# Controle de Entregas • Nilo Supermercado — V13

Versão focada em **ciclos automáticos por saída conjunta**, mantendo as melhorias anteriores de visibilidade, operação inteligente, modo treinamento, lixeira, KM diário, custos e relatórios.

## Regra principal da V13

**Todas as entregas que saem juntas recebem automaticamente o mesmo ciclo.**

O sistema considera a mesma saída quando as entregas possuem:

- a mesma data;
- a mesma hora de saída;
- o mesmo veículo;
- o mesmo entregador.

Ao confirmar uma nova saída com uma ou várias entregas, o sistema gera automaticamente um código como `CIC-20260714-03` e vincula todas as entregas selecionadas a esse ciclo.

## Detecção automática de saídas já registradas

A V13 também consegue revisar entregas já existentes que tenham horário de saída, veículo e entregador, mas ainda não possuam ciclo. Quando encontrar registros da mesma saída, cria o ciclo e faz os vínculos automaticamente.

Na tela **Ciclos**, existe o botão **Detectar saídas já registradas** para executar essa verificação manualmente quando necessário.

## O que continua igual

- Cada entrega tem seu próprio horário de finalização na casa do cliente.
- O retorno à loja fecha o ciclo inteiro.
- O KM continua sendo informado apenas uma vez no início e no fim do expediente de cada veículo.
- Reagendamentos não duplicam faturamento.
- A taxa de entrega entra na receita no registro da compra.
- Modo Treinamento e Operação Real continuam separados.
- Registros apagados continuam indo para a Lixeira.

Faça um **Backup JSON** antes de atualizar a versão publicada.
