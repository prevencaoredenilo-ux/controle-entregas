# Projeto Android — Nilo Entregas V14

Este projeto empacota a aplicação V14 dentro de um Android WebView e inclui os arquivos do sistema como assets locais.

## O que ele faz

- Abre o sistema sem depender da internet.
- Mantém cópia local dos dados no aparelho.
- Pode usar o PC como memória central pela rede local.
- Conecta ao servidor do PC por endereço como `http://192.168.1.50:8765`.
- Inclui calendário até pelo menos 2050 e expansão automática para manter anos futuros disponíveis.

## Gerar APK

### Opção 1 — GitHub Actions
Leia `GERAR_APK_NO_GITHUB.md`.

### Opção 2 — Android Studio
1. Abra esta pasta no Android Studio.
2. Aguarde a sincronização do Gradle.
3. Use **Build > Build APK(s)**.
4. O APK de teste será gerado em `app/build/outputs/apk/debug/`.

A primeira preparação do ambiente de desenvolvimento pode exigir internet para baixar SDK e dependências. Depois de instalado no aparelho, o uso diário do app e do servidor local não depende da internet.
