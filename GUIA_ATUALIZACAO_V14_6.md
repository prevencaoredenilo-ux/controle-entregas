# Atualização V14.6.0 • celular, tempo real e modo offline

## Primeiro acesso

1. Publique os arquivos da V14.6.0 na raiz do GitHub Pages.
2. Abra o sistema com internet no computador que já possui os dados operacionais.
3. Entre com o mesmo usuário e a mesma senha cadastrados no sistema Nilo.
4. Aguarde aparecer **Sincronizado em tempo real**. No primeiro acesso, os dados locais desse computador serão enviados para o banco online.
5. Abra o mesmo endereço no celular e entre com a mesma conta. O celular carregará os dados do banco.

## Funcionamento sem internet

- O sistema continua abrindo e salvando no aparelho depois que o primeiro acesso online foi concluído.
- O indicador lateral mostra quantas alterações aguardam sincronização.
- Quando a internet volta, a fila é enviada automaticamente.
- Enquanto um aparelho estiver offline, ele não receberá mudanças dos outros aparelhos. As atualizações aparecem quando ele se reconectar.

## Segurança

- O aplicativo usa somente a chave publicável no navegador; nenhuma chave administrativa fica no código.
- As tabelas `delivery_workspaces`, `delivery_workspace_members` e `delivery_sync_entities` têm RLS ativado.
- Os dados de entregas ficam separados das tabelas do outro sistema que utiliza o mesmo projeto Supabase.

## Arquivos que precisam ser enviados

- `.nojekyll`
- `index.html`
- `app.js`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`
- `VERSION.txt`
- pasta `icons`

Se uma versão antiga continuar aparecendo, feche todas as abas do sistema, abra novamente com internet e aguarde a troca do cache offline para V14.6.0.
