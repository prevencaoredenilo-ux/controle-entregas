# Guia de atualização para a V14

## Antes de publicar

1. Abra a versão atualmente usada na operação.
2. Clique em **Backup** e guarde o arquivo JSON em local seguro.
3. Não apague os dados do navegador antes de confirmar que o backup foi baixado.

## Publicação no GitHub Pages

Substitua somente os arquivos principais da raiz:

- `index.html`
- `styles.css`
- `app.js`
- `sw.js`
- `manifest.webmanifest`
- `README.md`
- `VERSION.txt`

As pastas de versões antigas podem permanecer como histórico, mas não são utilizadas pelo endereço principal.

## Primeira abertura após a publicação

1. Abra o sistema com internet.
2. Recarregue a página uma vez para garantir a ativação do novo modo offline.
3. Confira no rodapé se aparece **V14.3.4**.
4. Abra **Cadastros > Dados** e faça um novo backup.
5. Se precisar conferir a cópia de segurança automática, use **Backup antes da atualização**.

## Teste mínimo recomendado

Use o modo **Treino** para confirmar:

- cadastro de uma compra;
- pesquisa na tela Entregas por número da compra, DOC, caixa e dia;
- pesquisa na tela Pesquisar Entregas por nº do cupom, data, DOC e caixa;
- preenchimento de Nº DO CUPOM, Nº do DOC e Nº do caixa;
- preenchimento opcional de nome e telefone do cliente;
- montagem de uma saída;
- fechamento do ciclo;
- KM inicial e final;
- registro de custo;
- geração de relatório;
- conferência das 27 abas do relatório Excel;
- prévia de restauração de backup, cancelando antes da substituição.

## Compatibilidade

A V14.3.4 mantém os dados da V14.3.3, V14.3.2, V14.3.1, V14.3, V14.2, V14.1, V14, V13 e das versões anteriores reconhecidas pelo sistema. Os novos filtros e o ajuste visual não modificam os registros armazenados. Na primeira abertura, nenhuma entrega, ciclo, custo, KM, configuração ou histórico é apagado. Backups de uma versão futura são bloqueados para evitar perda de informações.
