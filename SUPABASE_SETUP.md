# Configuração opcional do Supabase

Este repositório não contém chaves, tokens ou credenciais do Supabase. A migração SQL em `supabase/migrations/20261117000100_create_user_records.sql` apenas define a estrutura e as políticas; ela **não foi executada** por este PR.

## Variáveis do frontend

Use somente variáveis de ambiente locais ou secrets do ambiente de CI:

- `VITE_SUPABASE_URL`: URL pública do projeto, por exemplo `https://<project-ref>.supabase.co`.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publicável recomendada pelo Supabase. Em projetos antigos, o painel pode chamar essa mesma credencial de `anon key`; nunca use a `service_role` no navegador.

Não faça commit de `.env`, `.env.*` com valores reais, tokens, service-role keys ou JSON de credenciais. O `.gitignore` deve continuar cobrindo esses arquivos.

## URLs permitidas

No Supabase Dashboard, em **Authentication → URL Configuration**, configure apenas as origens usadas pelo projeto:

- Desenvolvimento: `http://localhost:5173` ou a porta local realmente usada.
- Preview: a URL de preview do projeto, quando existir.
- Produção: `https://prevencaoredenilo-ux.github.io/controle-entregas/`.

Mantenha `Site URL` apontando para a origem principal escolhida. Não adicione curingas amplos nem domínios de terceiros não controlados.

## RLS e modelo de dados

A tabela `public.app_records` usa `user_id = auth.uid()` e RLS. As políticas permitem `select`, `insert`, `update` e `delete` somente quando o usuário autenticado é o dono do registro. A coluna `entity` possui uma restrição para limitar o conteúdo às coleções conhecidas do aplicativo.

O cliente deve usar a publishable/anon key e depender das políticas RLS. Nunca contorne RLS com uma chave privilegiada no frontend. Operações administrativas ou migrações devem ocorrer em ambiente protegido, com revisão e backup prévios.

## Aplicação segura

1. Crie as variáveis apenas no ambiente local/CI.
2. Revise a migração e faça backup antes de aplicá-la.
3. Execute a migração somente após aprovação explícita e em ambiente Supabase escolhido.
4. Verifique as políticas com usuários autenticados diferentes; confirme que um usuário não consegue consultar ou alterar `user_id` de outro.
5. Configure as URLs permitidas e teste login/logout sem colocar tokens na URL ou em logs.
