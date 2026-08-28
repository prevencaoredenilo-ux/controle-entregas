# Guia de atualização para a V14

## Antes de publicar

1. Abra a versão atualmente usada na operação.
2. Clique em **Backup** e guarde o arquivo JSON em local seguro.
3. Não apague os dados do navegador antes de confirmar que o backup foi baixado.

## Publicação no GitHub Pages

Substitua somente os arquivos principais da raiz:

- `index.html`
- `styles.css`
- `app.js`
- `sw.js`
- `manifest.webmanifest`
- `README.md`
- `VERSION.txt`

As pastas de versões antigas podem permanecer como histórico, mas não são utilizadas pelo endereço principal.

## Primeira abertura após a publicação

1. Abra o sistema com internet.
2. Recarregue a página uma vez para garantir a ativação do novo modo offline.
3. Confira no rodapé se aparece **V14.4.3**.
4. Abra **Cadastros > Dados** e faça um novo backup.
5. Se precisar conferir a cópia de segurança automática, use **Backup antes da atualização**.

## Teste mínimo recomendado

Use o modo **Treino** para confirmar:

- cadastro de uma compra;
- cálculo em tempo corrido de compra até saída e de compra até finalização no cliente;
- indicação de saída fora do padrão acima de 2h, entrega fora do padrão acima de 3h30 e prazo restante;
- pesquisa na tela Entregas por número da compra, nº do cupom, DOC, caixa, dia e nome do cliente;
- pesquisa na tela Pesquisar Entregas por nº automático da compra/entrega, cupom, data, DOC, caixa e cliente;
- preenchimento de Nº DO CUPOM, Nº do DOC e Nº do caixa;
- preenchimento opcional de nome e telefone do cliente;
- montagem de uma saída;
- fechamento do ciclo;
- KM inicial e final;
- registro de custo;
- geração de relatório;
- conferência das 31 abas do relatório Excel, incluindo `PREVISAO_MOVIMENTO`, `SLA_PRAZOS`, `FLUXO_OPERACIONAL` e `RESUMO_MENSAL`;
- conferência da formatação em R$, %, h/min e km;
- visualização dos novos gráficos no Dashboard e na impressão/PDF;
- conferência de uma compra programada ou reagendada que tenha sido entregue em uma tentativa posterior: ela deve aparecer como entregue, e não como programação aberta;
- conferência da aba `PROGRAMADAS` no Excel e da seção equivalente no PDF, com situação consolidada e data/hora da entrega;
- conferência, nos principais insights, da data com mais entregas em dia/mês/ano;
- conferência do dia da semana e da semana do mês com maior média, junto do período histórico usado no cálculo;
- conferência, no Dashboard, do dia e da semana previstos como mais movimentados nas próximas 5 semanas;
- conferência da aba `PREVISAO_MOVIMENTO` e do nível de confiança da estimativa;
- prévia de restauração de backup, cancelando antes da substituição.

## Compatibilidade

A V14.4.3 mantém os dados da V14.4.2, V14.4.1, V14.4.0, V14.3.8, V14.3.7, V14.3.6, V14.3.5, V14.3.4, V14.3.3, V14.3.2, V14.3.1, V14.3, V14.2, V14.1, V14, V13 e das versões anteriores reconhecidas pelo sistema. A previsão é somente leitura e recalculada automaticamente; ela não altera entregas, programações ou históricos. Na primeira abertura, nenhum registro, ciclo, custo, KM ou configuração é removido. Backups de uma versão futura são bloqueados para evitar perda de informações.
