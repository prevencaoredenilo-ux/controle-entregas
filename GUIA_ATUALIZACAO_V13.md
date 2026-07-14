# Atualização para V13 — Ciclos Automáticos por Saída Conjunta

## O que mudou

A V13 identifica automaticamente como um único ciclo todas as entregas que saem juntas.

A regra é:

- mesma data;
- mesma hora de saída;
- mesmo veículo;
- mesmo entregador.

Exemplo:

- Compra 31 — saída 10:30 — Strada 01 — João
- Compra 32 — saída 10:30 — Strada 01 — João
- Compra 33 — saída 10:30 — Strada 01 — João

Resultado: as três entregas recebem automaticamente o mesmo ciclo, por exemplo `CIC-20260714-03`.

Cada entrega continua tendo seu próprio horário de finalização na casa do cliente. O ciclo só termina quando o retorno ao mercado é registrado.

## Saídas antigas sem ciclo

Na tela **Ciclos**, use o botão **Detectar saídas já registradas**. O sistema procura entregas sem ciclo e agrupa automaticamente as que representam a mesma saída real.

## Como atualizar no GitHub Pages

1. Faça um **Backup JSON** no sistema atual.
2. Extraia o ZIP da V13.
3. Envie os arquivos para a raiz do mesmo repositório do GitHub Pages, substituindo os arquivos antigos.
4. Confirme o commit.
5. Aguarde a publicação.
6. Abra o site e pressione **Ctrl + F5**.
7. Confirme no rodapé: **V13.0.0**.

A V13 usa o cache `controle-entregas-v13-ciclos-automaticos` para reduzir o risco de a versão antiga continuar presa no navegador.
