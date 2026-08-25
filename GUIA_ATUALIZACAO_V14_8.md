# Atualização V14.8.0 • histórico de rotas GPS

## Antes de publicar

1. No sistema atual, gere um **Backup JSON** em Cadastros > Dados.
2. Publique todos os arquivos da V14.8.0 na raiz do GitHub Pages, incluindo a pasta `icons`.
3. Abra o sistema com internet e confirme que o rodapé mostra **V14.8.0**.
4. Atualize a página uma segunda vez para garantir a troca do cache offline.

## Verificação rápida

1. Confirme que todos os itens antigos do menu continuam disponíveis e que **Relatórios** permanece separado.
2. Abra **Histórico de rotas** e teste os filtros Hoje, semana, mês e período específico.
3. Pelo celular, monte um ciclo, permita a localização e confirme que o botão mostra **GPS ativo**.
4. Faça um pequeno deslocamento, feche o ciclo e confirme se o trajeto aparece no histórico.
5. Gere um novo Backup JSON e confirme que a prévia da restauração mostra a quantidade de **Rotas GPS**.

## Observações importantes

- O GPS do aparelho funciona sem internet e os pontos são sincronizados quando a conexão volta.
- O Google Maps precisa de internet para calcular e exibir as ruas.
- Mantenha o aplicativo aberto durante a rota. Navegadores móveis podem pausar a localização se a página for fechada ou o sistema operacional suspender o aplicativo.
- Nenhuma alteração de banco é necessária: os trajetos usam a mesma estrutura genérica e protegida de sincronização das demais entidades.
