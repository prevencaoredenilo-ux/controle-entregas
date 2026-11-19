# TODO — saneamento da versão ativa

## 1. Consistência técnica
- [x] Alinhar versão exibida, query strings dos módulos, Service Worker e manifesto.
- [x] Garantir que todas as referências locais da aplicação ativa existam.
- [x] Preservar `_arquivo_historico` sem misturar cópias antigas com a execução da raiz.

## 2. Métricas e regras
- [x] Calcular tempo médio no cliente quando existem chegada e finalização.
- [x] Evitar agrupamento de datas com conversão UTC que desloca dias em fusos brasileiros.
- [x] Manter no dashboard a distinção entre dados avaliados, pendentes e sem horário.

## 3. Interface e responsividade
- [x] Melhorar leitura do cabeçalho e dos filtros em mobile.
- [x] Tornar tabelas largas navegáveis sem quebrar o layout.
- [x] Reforçar foco visível, áreas de toque e estados vazios.
- [x] Reduzir efeitos quando o utilizador prefere movimento reduzido.

## 4. Relatórios e documentação
- [x] Manter exportação Excel/CSV e impressão sem prometer backend inexistente.
- [x] Documentar limitações reais: autenticação, sincronização, GPS e múltiplas viagens.
- [x] Entregar auditoria técnica com funções, fluxos e achados priorizados.

## 5. Validação
- [x] `node --check` nos módulos JavaScript ativos.
- [x] Verificação de referências de HTML e imports.
- [x] Servir a raiz por HTTP e verificar `index.html`, assets, módulos e Service Worker.
- [x] Gerar ZIP final somente com a pasta do projeto.

## 6. Repasses a entregadores terceirizados
- [ ] Cadastrar entregador como interno ou terceirizado, com periodicidade quinzenal/mensal e dados de pagamento.
- [ ] Calcular automaticamente o repasse integral da taxa nas entregas finalizadas por terceirizados.
- [ ] Excluir do repasse retiradas na loja e taxas reembolsadas.
- [ ] Exibir fechamento por período, marcar como pago e manter histórico auditado.
- [ ] Incluir os repasses na exportação CSV e no Dossiê Excel.
