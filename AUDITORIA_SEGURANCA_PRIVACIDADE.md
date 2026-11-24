# Auditoria técnica, segurança e privacidade

## Escopo

Auditoria da aplicação PWA offline-first em JavaScript, IndexedDB e Service Worker. A análise não constitui certificação de conformidade com a LGPD nem substitui avaliação jurídica ou decisão da organização.

## Correções implementadas nesta branch

- **Alta — restauração parcial:** `importAll` usava várias transações independentes para substituir coleções. A restauração agora valida o backup antes e grava todas as coleções em uma única transação IndexedDB; falha ou abort permanece rejeitável sem concluir parcialmente.
- **Alta — ausência de cópia anterior:** restauração de backup automático agora cria uma cópia de segurança do estado atual antes de substituir os dados.
- **Média — validação de estrutura:** foi extraído `validateBackupData`, com limites de tamanho, coleções obrigatórias, IDs, duplicidades, versão e esquema.
- **Média — cache excessivo:** o Service Worker deixou de interceptar métodos diferentes de GET, origens externas, caminhos de API/autenticação e respostas JSON variáveis.
- **Baixa — documentação obsoleta:** o plano não apresenta mais a senha fixa como mecanismo de segurança. A barreira local da Inteligência é descrita apenas como proteção de interface; autorização real exige backend.
- **Baixa — regressão:** foram adicionados testes para rejeição de backup incompleto, registro sem ID e IDs duplicados.

## Dados pessoais identificados

A aplicação pode armazenar nome de cliente, telefone, endereço, bairro, dados de entrega, observações, veículo, entregador/colaborador, custos e registros de auditoria. Esses dados permanecem no IndexedDB do aparelho e podem entrar em exportações, backups automáticos e relatórios Excel.

## Recomendações de privacidade

- Definir pela organização finalidade, base legal, responsáveis, prazo de retenção e procedimento de atendimento aos titulares.
- Restringir o uso em aparelhos compartilhados, proteger o sistema operacional e impedir exportações para locais não controlados.
- Avaliar minimização de telefone/endereço em relatórios gerenciais e anonimização em relatórios históricos quando possível.
- Definir retenção e descarte seguro de backups exportados. A lixeira atual é exclusão lógica para preservar histórico; ela não equivale a eliminação LGPD.
- Para uso entre dispositivos, integrar backend com autenticação individual, autorização server-side, RLS e auditoria centralizada.

## Limitações que permanecem

- A aplicação raiz continua offline-first; localStorage, IndexedDB e senha local não constituem autenticação ou autorização confiável.
- Concorrência entre dispositivos, conflitos e sincronização central exigem backend efetivamente integrado ao frontend.
- A migração Supabase está versionada, mas não foi executada e não está automaticamente consumida pela aplicação raiz.
- Acesso aos arquivos baixados depende do aparelho, navegador e permissões do usuário.

## Testes e evidências

Os comandos `npm run check:syntax` e `npm test` devem ser executados no CI. A publicação deve aguardar revisão do PR, confirmação das configurações do GitHub Pages e decisão explícita sobre qualquer backend ou migração externa.


## Atualização 13.66.0

OCR Tesseract.js e modelo português fast, além de jsQR, são ativos vendorizados e fixados localmente. O processamento da foto é local; nenhum envio a serviço de OCR/backend foi introduzido. CSP via meta restringe scripts a mesma origem, habilita worker local/blob para o runtime e permite somente conexões locais, Google Fonts e Open-Meteo. Service Worker armazena apenas respostas bem-sucedidas (res.ok) da mesma origem. Revisar manualmente implantação de CSP no GitHub Pages e comportamento offline em navegador real.
