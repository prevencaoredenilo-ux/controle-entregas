# Controle de Entregas • Nilo Supermercado — V14.3.5

Versão focada em **segurança dos dados, confiabilidade dos indicadores e acessibilidade**, mantendo os ciclos automáticos e todas as melhorias operacionais da V13.

## Novidades da V14.3

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
