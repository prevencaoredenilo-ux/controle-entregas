# Atualização para V7

1. Abra o app atual e faça um Backup JSON.
2. Baixe o ZIP da V7 e extraia os arquivos.
3. No mesmo repositório GitHub Pages, substitua `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `VERSION.txt`, `.nojekyll` e a pasta `icons`.
4. Faça commit.
5. Aguarde a publicação e abra o site com `Ctrl + Shift + R`.
6. Se ainda aparecer a versão antiga, abra em janela anônima ou limpe os dados do site/service worker.

Os dados continuam usando o mesmo banco local IndexedDB e são compatíveis com a V6.
