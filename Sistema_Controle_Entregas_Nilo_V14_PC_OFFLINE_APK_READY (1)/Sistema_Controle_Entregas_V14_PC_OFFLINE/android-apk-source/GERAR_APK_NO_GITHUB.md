# Gerar o APK pelo GitHub

Este projeto já inclui uma automação pronta em `.github/workflows/build-apk.yml`.

## Passo a passo

1. Crie um repositório novo no GitHub, por exemplo `nilo-entregas-android`.
2. Envie **todo o conteúdo desta pasta** para a raiz do repositório.
3. Abra a aba **Actions**.
4. Clique em **Gerar APK Nilo Entregas V14**.
5. Clique em **Run workflow**.
6. Quando terminar, abra a execução concluída e baixe o artefato **Nilo-Entregas-V14-APK**.
7. Dentro do ZIP estará o arquivo `app-debug.apk`, pronto para instalar em aparelhos Android compatíveis.

## Uso diário

O APK abre o sistema mesmo sem internet. Para usar o PC como memória central:

1. No PC, inicie o `Servidor_Nilo_Offline.exe`.
2. Deixe PC e celular na mesma rede Wi-Fi/local.
3. No app, abra **Cadastros e Configurações > Backup e memória**.
4. Informe o endereço mostrado pelo servidor, por exemplo `http://192.168.1.50:8765`.
5. Ative **Usar meu PC como memória central** e teste a conexão.

O aparelho mantém uma cópia local. Quando o PC fica temporariamente indisponível, o app continua funcionando localmente e tenta sincronizar ao reconectar.
