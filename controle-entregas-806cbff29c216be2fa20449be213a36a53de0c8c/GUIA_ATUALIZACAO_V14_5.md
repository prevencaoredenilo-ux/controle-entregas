# Atualização V14.5.0

## O que mudou

- Agendamentos agora registram dia, hora e detalhes adicionais.
- Entregas que pertencem a uma cadeia agendada ficam fora do indicador comum de atraso.
- Ao fechar um ciclo, o sistema pergunta se alguma entrega voltou sem ser entregue.
- Quando a resposta é **Sim**, aparecem somente as NFs ainda não finalizadas. Cada NF marcada exige o motivo da volta e aceita um detalhe complementar.
- Nomes de clientes e nomes de bairros são salvos em caixa alta.
- Telefones são formatados como `( 99 ) 9 9999-9999`.

## Como publicar no GitHub Pages

1. Abra o repositório `prevencaoredenilo-ux/controle-entregas` no GitHub.
2. Envie os arquivos do pacote V14.5.0 para a raiz do repositório, substituindo os arquivos com o mesmo nome.
3. Confirme o envio na branch `main`.
4. Aguarde a atualização do GitHub Pages e recarregue o sistema. Se a versão antiga ainda aparecer, feche e abra o aplicativo novamente para atualizar o cache offline.

Os dados existentes continuam armazenados no mesmo banco local. Na primeira abertura da V14.5.0, o sistema cria uma cópia de segurança local da versão anterior antes da migração.
