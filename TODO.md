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

## 7. Qualidade e foco da webcam
- [x] Solicitar até 1920×1080 sem exceder o máximo anunciado pela câmera e mostrar a resolução realmente entregue pelo navegador.
- [x] Permitir escolher outra webcam quando houver mais de uma, para evitar usar uma câmera de resolução inferior por engano.
- [x] Manter foco automático quando suportado e mostrar ajuste manual de distância apenas quando a câmera e o navegador oferecerem essa capacidade.
- [x] Preservar a captura por webcam e a seleção de foto se algum controle não estiver disponível.
- [x] Validar sintaxe, testes automatizados e integridade do diff; não há webcam física disponível neste ambiente para confirmar foco/resolução no dispositivo real.
- [x] Quando a primeira leitura do comprovante tiver baixa confiança ou faltar campo-chave, comparar até três versões da imagem processadas localmente com OCR em português.
- [x] Usar concordância e formato/contexto dos campos para escolher leituras; não preencher valores divergentes como se fossem certos e mostrar alternativas para conferência.
- [x] Manter o processamento OCR no navegador, sem enviar imagem ao servidor; validar com testes de consenso e conflito.
- [x] Exibir na prévia a imagem efetivamente tratada, remover o desfoque artificial e limitar a ampliação para preservar nitidez sem exceder 2,5 MP de processamento.
