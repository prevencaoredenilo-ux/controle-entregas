# Atualização para V11

1. Abra a versão atual do sistema e faça **Backup JSON**.
2. Extraia o ZIP da V11.
3. No repositório do GitHub Pages, substitua os arquivos da raiz pelos arquivos da V11.
4. Faça o commit.
5. Aguarde a publicação do GitHub Pages.
6. Abra o site e pressione **Ctrl + F5**.
7. Confirme que o menu mostra **Central de Operação** e que a tela inicial exibe a V11.

## Compatibilidade
A V11 mantém o mesmo banco local IndexedDB e migra automaticamente os dados antigos para o ambiente real.

## Novidade de encerramento
O sistema cria um checkpoint do dia e bloqueia o encerramento enquanto houver ciclo aberto, entrega em rota ou KM final pendente de veículo que trabalhou. O dia pode ser reaberto para correções.
