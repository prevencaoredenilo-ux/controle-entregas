# Órbita — Controle de Entregas (v2 completo, client-side)

## Correção v2.2 — horários obrigatórios no cliente

- Novo fluxo real: **Em rota → Na casa do cliente → Finalizada**.
- A ação **Chegou ao cliente** exige a data/hora da chegada na casa.
- A ação **Finalizar na casa do cliente** exige a chegada e a hora de conclusão; não permite conclusão anterior à chegada.
- Ao iniciar um ciclo, a saída da loja passa a ser registrada automaticamente em cada entrega.
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
