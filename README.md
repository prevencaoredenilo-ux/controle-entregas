# Órbita — Controle de Entregas (v5.14)


## Atualização v5.14 — Encerramento de ciclo inteligente

- O fim do ciclo valida somente eventos que pertencem ao próprio ciclo.
- Eventos de outros ciclos, agendamentos futuros ou registros antigos não bloqueiam o fechamento.
- Se houver um horário posterior ao informado, o sistema mostra qual entrega e qual evento causaram o bloqueio.
- Para horário de entrega ao cliente, há botão para corrigir o horário diretamente.
- Também é possível usar automaticamente o horário do último evento válido como fim do ciclo.
- Nenhum histórico ou backup existente é regravado automaticamente.


## Atualização v5.13 — Agendadas entram em “Na loja” no dia

- Uma entrega agendada permanece em **Agendadas** enquanto a data programada ainda não chegou.
- No dia agendado, ela passa a aparecer operacionalmente em **Na loja**, mantendo a informação de que é uma entrega agendada.
- Se a data agendada já passou e a entrega ainda não foi atendida, ela continua em **Na loja** até ser resolvida.
- No início do ciclo, agendadas cuja data já chegou vêm marcadas como disponíveis; agendadas futuras continuam desmarcadas.
- A mudança é apenas de comportamento operacional/visual: o histórico salvo não é reescrito e os backups não são alterados.


## Atualização v5.10 — Perguntas Premium
- Única área funcional alterada nesta versão: perguntas do topo.
- 100 perguntas de Prevenção de Perdas, incluindo FIFO, FEFO, PEPS, PVPS, inventário, validade, ruptura, avaria, recebimento, auditoria, acuracidade e análise de perdas.
- 100 Curiosidades Gerais de ciência, geografia, história, natureza, tecnologia e raciocínio.
- Mistura de níveis FÁCIL, MÉDIA e DIFÍCIL.
- A pergunta aparece primeiro; a resposta só é revelada ao clicar em “Ver resposta”.
- Navegação Anterior/Próxima e contador do ciclo.
- Não repete uma pergunta da mesma categoria até passar pelas 100.
- Alternância automática entre Prevenção de Perdas e Curiosidades Gerais.


## v5.8 — agendamento sem horário de saída indevido

- Ao agendar/editar uma entrega que ainda não iniciou ciclo, o formulário não exibe mais "Saída da loja" nem "Hora da entrega ao cliente".
- Agendar uma entrega na loja não tenta criar saída da loja e não exige KM inicial.
- Horários operacionais só passam a existir quando a entrega realmente inicia um ciclo.
- Ao transformar uma entrega da fila em agendada, o status passa para Programada sem criar horários de rota.
- Nenhuma migração ou alteração automática de históricos/backups foi adicionada.

# Órbita v3.5 — Perguntas no estilo motivacional + fade/marquee

## Base anterior v3.0
- O recurso do topo agora mostra **somente perguntas**, uma por vez, misturando Prevenção de Perdas e conhecimentos gerais.
- As perguntas ficam registradas localmente e **não se repetem até todas do banco terem aparecido**; quando o ciclo reinicia, a última pergunta não aparece novamente de imediato.
- Foram removidos seletor de categorias, placar e sequência de quiz; permanecem pergunta, alternativas, resposta correta e explicação curta.
- KM ganhou a ação **Corrigir fechamento antecipado** para o caso de alguém lançar o KM final no meio do expediente.
- Essa ação reabre o expediente (KM final volta a ficar pendente), libera o veículo para continuar em ciclos e mantém o KM final lançado por engano no histórico/auditoria.
- Se o fechamento geral do dia já tiver sido feito, ele é marcado como substituído e precisa ser confirmado novamente depois do KM final verdadeiro.
- Para datas passadas, o KM final continua podendo ser corrigido por **Editar KM final**, mas a reabertura operacional fica limitada ao mesmo dia.


## Atualizações desta versão
- Excel completo em um único arquivo `.xls` com 31 abas analíticas inspiradas no relatório de referência enviado.
- KM final pode ser corrigido depois de registrado; a alteração fica rastreada na auditoria e guarda histórico de correções.
- Central de Inteligência recebeu uma camada visual mais moderna, com faixa executiva de saúde, alertas, ocorrências e resultado.
- “Cadê o Nilo?” foi substituído por “Prevenção em Foco”, com quiz de Prevenção de Perdas e Curiosidades Gerais.

# Órbita — Controle de Entregas (v2 completo, client-side)

## Correção v2.8 — retorno visível, cache corrigido e Cadê o Nilo?

- Corrigido o problema que podia combinar o HTML novo com JavaScript antigo: os arquivos principais agora recebem a versão no endereço e o cache offline foi renovado em conjunto.
- A antiga Pausa do Nilo foi substituída pelo minijogo **Cadê o Nilo?**: três caixas embaralham, o usuário escolhe uma e o mascote é revelado com animação e confetes.
- O registro de **Retorno de entrega à loja** ganhou um painel permanente logo abaixo do cabeçalho principal, antes dos indicadores, além dos atalhos já existentes.
- Ao clicar no retorno sem haver entrega elegível, o sistema explica claramente que a entrega precisa estar **Em rota** ou **Na casa do cliente** e mostra o caminho do processo.
- O encerramento pergunta exatamente **“Esta entrega voltou? SIM ou NÃO?”**, mostra uma pendência por vez e continua bloqueado até todas serem resolvidas.
- Responder SIM exige horário de retorno, motivo, situação da mercadoria, descrição do retorno parcial quando aplicável, decisão de reentrega e novo horário quando houver outra tentativa.
- Responder NÃO abre obrigatoriamente chegada e finalização no cliente.
- Antes da confirmação final do ciclo, um resumo mostra entregues, retornos, reentregas e zero pendências.
- Entregas que ainda pertencem a ciclo aberto não podem ser incluídas indevidamente em outro ciclo.
- O CSV inclui situação da mercadoria e itens/volumes retornados.

## Atualização v2.7 — retorno obrigatório e Pausa do Nilo

- O cabeçalho ganhou a **Pausa do Nilo**, uma interação divertida e totalmente separada da operação, com pedra-papel-tesoura, desafio surpresa e piada.
- **Registrar retorno** agora aparece nos comandos rápidos, na própria entrega em rota e durante a finalização do ciclo.
- Ao tentar finalizar um ciclo com entrega sem os horários completos, o sistema mostra **uma pendência por vez** e pergunta: “Esta entrega voltou para a loja?”.
- Se voltou, são obrigatórios: **data/hora do retorno, motivo e decisão sobre nova tentativa**. Se houver reentrega, a nova data/hora também é obrigatória.
- Motivos padrão incluem cliente ausente, endereço não localizado, telefone sem resposta, recusa, problema com mercadoria, pagamento não realizado, problema no veículo e outros.
- O ciclo permanece bloqueado até todas as entregas estarem finalizadas com chegada e conclusão ou possuírem retorno completamente identificado.
- Cada retorno guarda uma tentativa histórica com ciclo, saída, eventual chegada, horário do retorno, motivo, observação, responsável e reentrega; a tentativa anterior não é apagada.
- Entregas marcadas para nova tentativa voltam a ficar disponíveis para um ciclo quando chega o horário programado.
- O Excel/CSV ganhou colunas específicas de retorno e o Centro de Inteligência passa a considerar ocorrências históricas mesmo depois da reentrega ser concluída.

## Atualização v2.6 — dois SLAs, prevenção e fechamento do dia

- Dois tipos de atraso independentes: **saída/início acima de 2 horas** e **chegada à casa do cliente acima de 3 horas e 30 minutos**, contados desde a entrada da compra ou do horário agendado.
- Alerta preventivo padrão 30 minutos antes de cada limite; Central separa atraso de saída, atraso de chegada e risco próximo.
- Histórico preserva o atraso mesmo depois de a saída ou chegada ter sido registrada.
- Centro de Inteligência mede cumprimento dos dois SLAs, mostra gráficos e permite configurar limites, antecedência e meta percentual.
- Exportação Excel/CSV e relatório gerencial incluem limites e situação de cada SLA.
- Capacidade da próxima saída baseada na média real dos ciclos fechados e nos veículos disponíveis com KM liberado.
- Painéis laterais detalham SLA, financeiro e capacidade sem abandonar a Central.
- Fechamento guiado verifica ciclos, entregas pendentes, KM final, horários e custos; o fechamento fica persistido e auditado.
- Perfis locais: **Equipe Operacional, Líder, Consulta e Administrador**, com menus e ações compatíveis com cada função.
- Novos eventos de auditoria registram operador e função. Como esta versão é local/offline, segurança forte entre vários aparelhos ainda exige um banco com autenticação e regras no servidor.

## Atualização v2.5 — bloqueio por KM e prontidão operacional

- Nenhum ciclo pode ser iniciado sem **KM inicial registrado no mesmo dia, ambiente e veículo**, com o expediente ainda aberto.
- Veículos sem KM, em ciclo ou com expediente já encerrado aparecem indisponíveis na seleção do ciclo.
- Removido o atalho que permitia marcar uma entrega “Em rota” fora de um ciclo.
- Não é possível lançar manualmente uma nova hora de saída em uma entrega que nunca participou de ciclo.
- Não é permitido duplicar expediente de KM para o mesmo veículo e dia.
- O KM final fica bloqueado enquanto existir ciclo aberto no veículo.
- O cabeçalho da Central agora mostra prontidão do turno, veículos liberados, fila e ciclos, com explicação interativa do termômetro.
- Cards de SLA, financeiro e entregas do mapa operacional agora abrem os detalhes correspondentes.
- O Centro de Inteligência ganhou uma leitura automática clicável de atrasos, gargalo, resultado e confiabilidade dos dados.

## Atualização v2.4 — sala de controle e inteligência completa

- O início do ciclo exige confirmação da **hora exata da saída** antes de iniciar; esse horário alimenta a saída de todas as entregas do ciclo.
- O fim do ciclo exige confirmação da **hora exata do encerramento** antes de liberar veículo e entregador, com validação contra o último evento operacional.
- Central Operacional refeita como sala de controle: pulso, fluxo ao vivo, SLA, resultado do dia, alertas, ciclos com duração, comandos e mapa operacional.
- Dashboard reorganizado em Visão geral, Fluxo, Tempos/SLA, Ciclos/Frota, Financeiro e Qualidade, com comparação ao período anterior e previsões baseadas somente no histórico real.
- Gráficos redesenhados com eixos, valores, movimento, tooltips e adaptação para celular.

## Atualização v2.3 — chegada visível e Dashboard completo

- A ação **Chegou no cliente** passou para os comandos rápidos da Central Operacional.
- Cada entrega em rota ganhou um botão visível **Chegou no cliente** na própria fila; entregas já na casa do cliente exibem **Finalizar entrega**.
- A Central permite selecionar a entrega em rota por compra, cliente, cupom, PDV e DOC antes de registrar a hora.
- Cards operacionais, ações, entregas e gráficos exibem balões informativos após aproximadamente 0,5 segundo com o mouse parado.
- Dashboard com filtros de **Dia, Semana, Mês, Ano, Todo o histórico e Período personalizado**.
- Indicadores operacionais: total, finalizadas com horário, pendentes, atrasadas, retornos/problemas, prioridades, agendadas, taxa de sucesso, ciclos, produtividade, KM e tempo total.
- Indicadores de eficiência: espera na loja, tempo em rota, tempo na casa do cliente e inconsistências de horário.
- Indicadores financeiros: taxas brutas, reembolsos, receita líquida, custos, resultado, custo/entrega, receita/entrega e custo/KM.
- Previsões estatísticas para próximo dia, próxima semana e próximo mês com base no histórico real; não são garantias de demanda.
- Gráficos animados e interativos para evolução de entregas, status, dias da semana e composição financeira.
- Rankings por entregador, veículo e bairro, recorrência de clientes e verificação da qualidade dos dados.
- Identificação visual **v2.3** e novo cache da PWA para garantir que a atualização apareça.

## Correção v2.2 — horários obrigatórios no cliente

- Novo fluxo real: **Em rota → Na casa do cliente → Finalizada**.
- A ação **Chegou ao cliente** exige a data/hora da chegada na casa.
- A ação **Finalizar na casa do cliente** exige a chegada e a hora de conclusão; não permite conclusão anterior à chegada.
- Ao iniciar um ciclo, a hora exata informada na confirmação é aplicada como saída da loja em cada entrega.
- No fechamento assistido, responder **Não, foi entregue** abre obrigatoriamente os dois horários; não existe mais finalização direta sem hora.
- Um ciclo não fecha se houver entrega em rota, na casa do cliente ou marcada como finalizada sem hora de conclusão.
- Saída, chegada e finalização podem ser editadas posteriormente na ficha da entrega e cada alteração gera auditoria.
- A fila da Central mostra os horários de chegada e finalização; os relatórios CSV e PDF também incluem os três horários.
- Identificação visual **v2.2** adicionada à tela e atualização da PWA corrigida para não manter a interface anterior no cache.

## Atualização v2.1 — Central Operacional viva

- Central Operacional transformada em mesa de comando: cadastro de entrega, início e finalização de ciclo, KM inicial/final e lançamento de custo podem ser executados sem sair da Central.
- Painéis ao vivo para ciclos abertos, expedientes sem KM final e fila de entregas que exige acompanhamento.
- Cards clicáveis e animados: filtram a fila por status, prioridade e atraso; os balões explicativos aparecem após 0,5 segundo.
- Termômetro de desempenho calculado automaticamente com conclusão (65%), pontualidade (20%) e qualidade/ocorrências (15%) somente sobre o dia atual.
- Faixas motivacionais: Crítico, Atenção, Bom ritmo, Muito bom e Excelente. Cada faixa controla o humor e as frases do mascote.
- Mascote clicável, com reação, respiração, aceno periódico e frases coerentes com o desempenho.
- Saudação por horário com rodízio automático de todos os colaboradores ativos cadastrados.
- Edição completa de veículos, entregadores, colaboradores, bairros, categorias de custo e motivos de retorno, mantendo auditoria e histórico.
- Relatório gerencial e 13 exportações analíticas com seleção de período; impressão/PDF com cabeçalho da marca e dados financeiros filtrados.
- Separação entre Operação Real e Treinamento aplicada também aos ciclos e aos indicadores da Central.

## Como publicar
Suba **todos os arquivos desta pasta** (incluindo `icons/`) para um repositório GitHub e ative o GitHub Pages na branch `main`, pasta raiz — mesmo processo do app original. Funciona 100% offline (IndexedDB + Service Worker) e é instalável como PWA.

## Identidade visual (atualizado)

Logo Nilo, mascote e logo Triela Soluções aplicados de verdade (pasta `assets/brand/`), paleta trocada para azul Nilo (`#0B2A4A`) + amarelo Nilo (`#FFDD00`) + branco, slogan na sidebar, mascote com selo de humor conforme o desempenho do dia, logo Triela discreta no rodapé, ícones do PWA gerados com o mascote.

**O que não deu pra fazer nessa rodada**: o recolhimento da sidebar (logo grande → rosto do mascote) mencionado no documento não foi implementado — hoje a sidebar é fixa ou vira menu hambúrguer no mobile, sem estado "recolhido" intermediário no desktop.

## Atualização — ajustes de UX e o que vem do repositório de referência mais avançado

Você indicou o repositório `prevencaoredenilo-ux/controle-entregas` (V14.8) como referência adicional. Ele está muito além do que qualquer um dos pacotes anteriores — GPS de rota em tempo real, sincronização multi-dispositivo via Supabase Realtime, previsão estatística de movimento futuro, Excel com 30+ abas analíticas. **Não implementei nada disso ainda** — é trabalho substancial e depende de backend real. Fica como roteiro para as próximas rodadas, priorizado assim (na minha avaliação, mas me diga se a ordem deveria ser outra):
1. Sincronização multi-dispositivo (Supabase Realtime) — depende do backend da Fase 1.
2. Detecção automática de ciclo por saída simultânea (mesma data/hora/veículo/entregador).
3. Cálculo de SLA (compra→saída, compra→entrega) com limites configuráveis.
4. Excel com múltiplas abas analíticas (hoje exportamos CSVs separados, não um único Excel com abas).
5. GPS de rota e previsão de movimento futuro — funcionalidades mais avançadas, ficam por último.

### O que apliquei nesta rodada (concreto e testado)
- Central Operacional: card de saudação bem mais destacado, saudação automática por horário **+ nome do colaborador** (seletor "Quem está operando?" na sidebar — não é login/senha, é só identificação local para personalizar e assinar lançamentos), frase motivacional automática conforme o desempenho do dia, tira de alertas do dia (atrasos, prioritárias, KM pendente, reentregas).
- Cards com animação de entrada, números contando, e tooltip ao passar o mouse explicando cada indicador.
- Ação rápida de **Registrar KM** direto na Central Operacional (além de nova entrega, iniciar/finalizar ciclo).
- Cadastro de veículo bem mais robusto: fabricante, modelo, placa, ano de fabricação, tipo, capacidade.
- Novo cadastro de **Colaboradores** (para a saudação/identificação, separado dos Entregadores da operação).
- Dashboard bem mais completo: taxa de sucesso, produtividade por ciclo, KM total, reembolsos, gráfico de entregas por dia da semana, gráfico de distribuição por status, rankings por entregador/veículo/bairro, indicadores de qualidade dos dados (campos faltando). Os gráficos são SVG feitos à mão (sem biblioteca externa) — garante que funcionem 100% offline.
- Relatórios: exportação em CSVs separados por área (entregas, ciclos, KM, custos, auditoria) além do "exportar tudo", e o relatório de impressão/PDF ganhou seções de indicadores, financeiro, gráfico por dia da semana e ranking.

## O que está implementado e testado (sintaxe validada, lógica revisada)

- Central Operacional: saudação por horário, indicador online/offline, contadores do dia (na loja, em rota, prioritárias, atrasadas, ciclos ativos, reentrega, agendadas, KM pendente), ações rápidas, mascote com humor conforme desempenho do dia.
- Cadastro de entrega completo (seção 7): todos os campos pedidos, número de compra/chegada gerados automaticamente (contínuo/diário) no momento de salvar, bloqueio de cupom duplicado, validação de obrigatórios, máscara de telefone.
- Fluxo de status (seção 8): Na loja → Em rota → Finalizada, Finalizada → Retorno/Reentrega, Retirada na loja com pergunta de reembolso, reagendamento que preserva a tentativa anterior — tudo com histórico append-only por entrega.
- Ciclos (seção 9): iniciar ciclo bloqueia veículo/entregador já em uso, ordena por prioridade + ordem de bairro, permite reordenar manualmente; finalizar ciclo pergunta "voltou?" uma pendência por vez e só fecha quando tudo estiver resolvido.
- Quilometragem: KM inicial/final por veículo/expediente, com validação de KM final ≥ inicial.
- Custos e financeiro: lançamento de custos, resumo com taxas, reembolsos, custos, saldo, custo por KM e por entrega.
- Busca geral por múltiplos campos.
- Relatórios: impressão/PDF (via impressão do navegador) e exportação CSV (abre no Excel).
- Auditoria automática (toda escrita relevante gera um evento, sem edição posterior).
- Lixeira com restauração, backup/restauração completa em JSON (com backup de segurança automático antes de restaurar).
- Cadastros administrativos: veículos, entregadores, bairros (com ordem de rota), categorias de custo, motivos de retorno — desativar preserva histórico.
- Modo Treinamento separado da Operação Real (seletor na sidebar), sem misturar dados nos números.

## O que ficou faltando ou simplificado — não vou fingir que está pronto

- **Entrega Grande com múltiplas viagens**: o campo de quantidade de viagens existe e é salvo, mas a tela para registrar a saída/chegada de cada viagem individualmente **não foi construída** — hoje a entrega Grande segue o mesmo fluxo de status das demais.
- **"Custos pendentes" na Central Operacional**: não implementei esse indicador porque o modelo atual não tem um conceito claro de custo "pendente" (todo custo lançado já é considerado fechado). Precisa de definição sua sobre o que conta como pendente.
- **Login individual, perfis (admin/líder/operacional/consulta) e RLS**: **não existe neste pacote**. Isso exige backend real (Supabase) — já entreguei o schema e as políticas de segurança (`db/01_schema.sql` e `db/02_rls.sql`, na entrega anterior), mas não estão plugadas aqui. Hoje qualquer pessoa com o link tem acesso total.
- **Sincronização entre dispositivos, fila com idempotência, detecção de conflito**: **não implementado**. Só funciona em um aparelho por vez. Depende do mesmo backend acima.
- **Corte oficial em 01/09/2026**: não apliquei esse filtro porque, sem autenticação/backend, não há "histórico anterior" de verdade a esconder — é um sistema novo. Quando plugarmos o backend, esse filtro entra nas queries.
- **Testes automatizados**: não existem. O que fiz foi validação de sintaxe (`node --check`) e revisão manual da lógica — não é a mesma coisa que testes de fluxo executados de verdade, e não vou chamar isso de "testado".
- **Identidade visual Nilo/Triela**: mantive a paleta própria que já vínhamos usando (navy + laranja) em vez da paleta azul/amarelo Nilo — não recebi os arquivos de logo/mascote mencionados no documento. Se você me enviar os assets, eu adapto as cores e substituo o mascote emoji por algo com a marca de verdade.

## Checklist da seção 16 do seu documento

| Item | Status |
|---|---|
| Cadastro de entrega válida / rejeição sem obrigatórios | ✅ Implementado |
| Edição de entrega | ✅ Implementado |
| Geração automática de compra/chegada | ✅ Implementado |
| Ciclo completo / ciclo com pendência | ✅ Implementado |
| Retorno, reentrega, reagendamento | ✅ Implementado |
| Retirada com/sem reembolso | ✅ Implementado |
| Entrega Grande com múltiplas viagens | ⚠️ Parcial (campo existe, fluxo de viagens não) |
| Bloqueio de veículo/entregador ocupado | ✅ Implementado |
| KM inicial/final e validação | ✅ Implementado |
| Custos e resultado financeiro | ✅ Implementado |
| Backup e restauração | ✅ Implementado |
| Lixeira e recuperação | ✅ Implementado |
| Auditoria | ✅ Implementado (sem tela de detalhe do "antes/depois" ainda) |
| Treinamento separado da Operação Real | ✅ Implementado |
| Permissões por perfil | ❌ Não implementado (precisa de backend) |
| Offline | ✅ Implementado |
| Reconexão e sincronização sem duplicidade | ❌ Não implementado (precisa de backend) |
| Conflito entre dispositivos | ❌ Não implementado (precisa de backend) |
| Mobile / Desktop / PWA instalada | ✅ Responsivo e instalável (não testado em aparelho físico por mim) |
| Relatórios gerencial e Excel | ✅ Implementado |


## Versão 3.1 — retorno à fila e perguntas automáticas
- Entrega registrada como retorno muda imediatamente para **Na loja**.
- O retorno continua salvo em `returnAttempts` e na auditoria, sem perder motivo, horário ou situação da mercadoria.
- A entrega retornada volta a ficar disponível para seleção em outro ciclo.
- Perguntas aparecem automaticamente no topo, alternando rigorosamente entre Prevenção de Perdas e Curiosidades Gerais.
- As opções de resposta só são abertas quando o operador clica na pergunta visível.
- Cada categoria evita repetir perguntas até percorrer seu próprio banco.

## Versão 3.6 — backup automático reforçado

- Backup automático imediatamente após inclusão, edição ou exclusão de dados operacionais.
- Mudanças de status, retornos, ciclos, quilometragem, custos e cadastros também disparam snapshot.
- Backup periódico de segurança a cada 1 minuto, mesmo quando não ocorre nova alteração.
- Snapshot adicional na abertura do sistema.
- Retenção local dos 50 backups automáticos mais recentes.
- A tela Configurações identifica se o backup foi de abertura, periódico de 1 minuto ou provocado por alteração.


## v5.6 — sequência por lançamento
- Entregas normais usam a data operacional escolhida e recebem o próximo número disponível daquele dia.
- Entrega retroativa: se o dia terminou em #10, a próxima lançada para esse mesmo dia recebe #11, independentemente da hora informada.
- O recálculo diário usa a ordem real de criação dos registros no sistema e não altera a numeração das agendadas.

## v5.7 — ajustes operacionais solicitados
- Numeração única diária pela data real da compra, incluindo entregas agendadas na mesma sequência.
- A data agendada não interfere no Nº da entrega.
- Nº da entrega aparece automaticamente no formulário antes de salvar; Nº de chegada deixou de aparecer porque representava a mesma sequência.
- Um único horário de entrega ao cliente; o sistema não pede chegada e finalização separadamente.
- Seleção do ciclo reorganizada em cards compactos, com checkbox corrigido e informações alinhadas.
- Taxa de entrega entra como receita no momento do cadastro; reembolsos são descontados separadamente.
- Nenhuma renumeração automática de registros antigos na abertura.


## v5.10 — atualização visual isolada
- Novo painel operacional moderno para perguntas.
- Ícone exclusivo de escudo com confirmação para Prevenção de Perdas.
- Ícone de lâmpada redesenhado para Curiosidades.
- Categoria, dificuldade e contador separados visualmente.
- Botão Ver resposta com maior destaque.
- Cache/service worker alterado para forçar a chegada desta atualização.
- Nenhuma outra área funcional foi alterada.
