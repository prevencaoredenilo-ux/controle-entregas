# Nilo Entregas V14 — PC como memória central + APK Android + uso sem internet

## Como fica a arquitetura

**PC principal**
- Executa `Servidor_Nilo_Offline.exe`.
- Guarda os dados em `dados/estado.json`.
- Cria cópias de segurança automáticas em `backups/`.
- Abre o sistema no navegador pelo endereço `http://127.0.0.1:8765`.

**Celular / APK**
- Abre a aplicação localmente, mesmo sem internet.
- Mantém uma cópia local dos dados.
- Quando está na mesma rede do PC, sincroniza com a memória central usando um endereço como `http://192.168.1.50:8765`.

## Internet é necessária?

Não para o uso diário. O PC e o celular precisam apenas estar conectados à mesma rede local/Wi-Fi para sincronizar entre si.

Se o PC ficar desligado ou fora da rede, o aparelho continua com a cópia local. Quando a conexão com o PC voltar, o sistema tenta sincronizar novamente.

## Primeira instalação no PC

1. Extraia a pasta inteira em um local fixo, por exemplo `C:\Nilo_Entregas_V14`.
2. Dê dois cliques em `INICIAR_SISTEMA.bat`.
3. Mantenha a janela do servidor aberta durante o uso.
4. O navegador abrirá automaticamente.
5. A tela do servidor também mostra os endereços para acesso por celular na mesma rede.

## Onde ficam os dados

- Dados principais: `dados/estado.json`
- Backups automáticos: `backups/`

Não apague essas pastas.

## Configurar o APK/celular para usar o PC como memória

1. Inicie o servidor no PC.
2. Deixe o PC e o celular na mesma rede Wi-Fi/local.
3. No sistema, abra **Cadastros e Configurações > Backup e memória**.
4. No campo **Endereço do PC**, informe o endereço exibido pelo servidor, por exemplo `http://192.168.1.50:8765`.
5. Marque **Usar meu PC como memória central**.
6. Clique em **Salvar e testar conexão**.

## Calendário

A V14 disponibiliza anos de 2024 até pelo menos 2050. Depois disso, o limite se expande automaticamente para manter 25 anos futuros disponíveis, além de preservar qualquer ano já existente nos dados.

## APK

A pasta `android-apk-source` contém o projeto Android completo e uma automação do GitHub Actions para gerar o APK. Veja:

- `android-apk-source/GERAR_APK_NO_GITHUB.md`
- `android-apk-source/README_BUILD_APK.md`

## Backup recomendado

Mesmo com a memória central no PC e os backups automáticos, continue fazendo um backup JSON manual antes de grandes atualizações do sistema.
