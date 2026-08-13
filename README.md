# Controle de Entregas • Nilo Supermercado — V14.4.2

Versão focada em **segurança dos dados, confiabilidade dos indicadores e acessibilidade**, mantendo os ciclos automáticos e todas as melhorias operacionais da V13.

## Novos insights da V14.4.2

- O relatório mostra a **data exata com mais entregas**, em dia/mês/ano, acompanhada do dia da semana e da quantidade entregue.
- Um novo indicador identifica o **dia da semana com maior média diária de entregas**.
- Outro indicador identifica a **semana do mês com maior média diária**, separando dias 1–7, 8–14, 15–21, 22–28 e 29 até o fim do mês.
- As médias usam automaticamente até os **365 dias mais recentes com histórico disponível**. Se houver menos de um ano, usam todo o intervalo existente.
- O PDF e o resumo executivo do Excel informam o início, o fim, os dias de calendário e a quantidade de entregas usados no cálculo.
- São contabilizadas compras realmente entregues ao cliente, considerando todas as tentativas ligadas e sem duplicar reagendamentos.

## Correção da V14.4.1

- Programações e reagendamentos agora são conferidos pela cadeia completa da compra antes de qualquer contagem.
- Se uma tentativa posterior possui finalização no cliente, a compra é contabilizada como **Entregue**, mesmo que um registro anterior permaneça como `Programada` ou `Reagendada` no histórico.
- A agenda separa compras **abertas**, **em atendimento** e **já entregues após programação**, sem excluir ou reescrever registros antigos.
- Dashboard, análises por bairro, Excel e impressão/PDF usam a situação consolidada da compra nos totais atuais.
- O Excel preserva o status de cada registro e acrescenta a situação consolidada; a aba `PROGRAMADAS` passa a mostrar também o resultado final, a data/hora da entrega e a tentativa concluída.
- Nenhum dado operacional é removido: programação, reagendamento, tentativas e ocorrências continuam disponíveis para auditoria.

## Novidades da V14.4

- Dashboard gerencial ampliado com indicadores financeiros, operacionais, SLA e produtividade, mantendo o tema e a estrutura conhecidos pela equipe.
- Novos gráficos de cumprimento dos prazos, fluxo compra → saída → finalização, distribuição por status, custos por categoria, evolução diária, faturamento x custos e bairros.
- Valores aparecem com unidades consistentes: moeda em **R$**, percentuais em **%**, duração em **h e min** e distância em **km**.
- O Excel passou para **30 abas**, acrescentando `SLA_PRAZOS`, `FLUXO_OPERACIONAL` e `RESUMO_MENSAL`.
- As células do Excel continuam numéricas e agora recebem formatos próprios de moeda brasileira, porcentagem, duração, minutos e quilômetros, permitindo filtros, fórmulas e novas análises.
- Impressão/PDF ganhou painel visual de prazos, gráfico por status, resumo mensal e formatação contextual dos indicadores.
- Nenhum dado de entrega é convertido ou removido: os novos painéis e relatórios são calculados sobre os registros já existentes.

## Novidades da V14.3

- Na V14.3.8, o sistema calcula em tempo corrido **Compra → Saída** e **Compra → Entrega finalizada no cliente**. A saída fica fora do padrão acima de 2h e a entrega final fica fora do padrão acima de 3h30.
- A Central de Operação mostra o tempo total transcorrido e o prazo restante. Exemplo: compra às 10:00 e saída às 12:00 deixam 1h30 para finalizar no cliente.
- Histórico, rastreamento, edição, Dashboard, alertas, Excel e impressão/PDF exibem os novos tempos e padrões. Registros antigos sem horários suficientes aparecem como não calculáveis e não são marcados como OK.
- Os limites podem ser ajustados em **Cadastros > Regras**, sem modificar os dados já cadastrados.
- Na V14.3.7, o número da compra aparece no Histórico de entregas com o mesmo tamanho, peso e cor do número do cupom; DOC e caixa continuam em texto secundário.
- Na V14.3.6, a tela **Pesquisar Entregas** ganhou um filtro separado para o número automático da compra/entrega gerado pelo próprio sistema.
- O nº da compra/entrega e o nº do cupom usam o mesmo destaque amarelo no cadastro e nos resultados da pesquisa.
- Na V14.3.5, as duas pesquisas também localizam pelo nome completo ou por parte do nome do cliente, ignorando diferenças de maiúsculas e acentos.
- Na V14.3.4, a antiga tela de rastreamento virou **Pesquisar Entregas**, com filtros separados por nº do cupom, data, DOC e caixa e uma lista para selecionar o histórico desejado.
- Todos os campos do lançamento rápido passaram a ter a mesma largura e altura; o **Nº DO CUPOM** aparece claramente como obrigatório.
- Na V14.3.3, o nome **Cupom PDV** foi substituído por **Nº DO CUPOM** na interface, no Excel e na impressão/PDF, sem alterar os cupons já cadastrados.
- A tela **Entregas** pesquisa todo o histórico por número da compra, número do cupom, DOC, caixa ou dia, separadamente ou combinando os filtros.
- Na V14.3.1, o número da compra é preenchido automaticamente, não pode ser alterado por engano e acompanha a data escolhida.
- O campo do número usa o mesmo fundo azul-escuro dos demais campos, com número amarelo de alto contraste.
- Confirmação visual dos campos **Nº DO CUPOM**, **Nº do DOC**, **Nº do caixa**, **nome do cliente** e **telefone** no lançamento rápido.
- DOC e caixa são obrigatórios; nome e telefone continuam opcionais.
- Os seletores de ano oferecem 10 anos anteriores e 20 anos futuros, além de qualquer ano já existente nos dados.
- O Excel passou para **27 abas**, incluindo resumo diário, distribuição das taxas do PDV e metodologia dos indicadores.
- Arquivos JavaScript, CSS e service worker receberam identificação de versão para evitar que o navegador continue exibindo uma versão antiga após a publicação.
- A atualização continua criando uma cópia local da versão anterior e preservando todos os registros.

## Novidades da V14.2

- O Excel passou de 14 para 24 abas formatadas na V14.2 e chegou a 27 abas na V14.3.
- Comparação automática com o período imediatamente anterior.
- Análises por dia da semana e faixa de horário para identificar picos.
- Rankings de qualidade por bairro, entregador, veículo e caixa PDV.
- Produtividade, sucesso, atrasos, problemas, tempos médios e faturamento por caixa, equipe, veículo e bairro.
- Clientes recorrentes, frequência, bairros atendidos, problemas e faturamento por cliente.
- Motivos de ocorrências, devoluções, reagendamentos e cancelamentos.
- Qualidade dos dados e lista detalhada de campos ausentes, duplicidades, lacunas e horários inconsistentes.
- Previsão das entregas programadas por data, situação, bairro, contato e próxima ação.
- Impressão/PDF com insights, comparação, ranking e qualidade dos dados.
- Todos os indicadores são calculados durante a geração do relatório e não modificam os registros armazenados.

## Novidades da V14.1

- O lançamento rápido possui campos separados para **Nº DO CUPOM**, **Nº do DOC** e **Nº do caixa**.
- **Nome do cliente** e **número de telefone** são opcionais.
- Os novos dados aparecem na operação, edição, agenda, rastreamento e relatórios.
- O Excel da V14.1 incluía 14 abas; a V14.2 ampliou essa estrutura para 24 abas analíticas.
- A impressão/PDF também mostra a identificação completa das compras e os principais dados operacionais.
- A migração mantém todas as entregas atuais; registros antigos apenas recebem os novos campos vazios.
- Antes da primeira migração, uma cópia local da versão anterior fica disponível em **Cadastros > Dados > Backup antes da atualização**.

## Principais melhorias da V14

- A restauração valida o arquivo e mostra uma comparação antes de substituir os dados.
- Um backup dos dados atuais é baixado automaticamente antes da restauração confirmada.
- Arquivos incompatíveis, excessivamente grandes ou com estruturas inseguras são recusados.
- Os indicadores de dias ativos e dias fechados agora mostram zero quando não há movimento.
- Textos de pendências e concordância de singular/plural foram corrigidos.
- O status de conexão deixa claro que os dados continuam locais e não sincronizados.
- Modais fecham com `Esc`, mantêm o foco dentro da janela e devolvem o foco ao botão de origem.
- Contraste e tamanho dos textos do cadastro rápido foram corrigidos.
- O modo offline usa a rede quando disponível e o cache quando necessário, reduzindo o risco de uma versão antiga permanecer presa no aparelho.

## Regra operacional mantida da V13

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
