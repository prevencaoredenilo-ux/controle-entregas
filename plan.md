# Plano — novo sistema Órbita Controle de Entregas

## Objetivo
Manter a experiência da aplicação sobre os módulos existentes, preservando dados e funcionalidades, sem tratar senha local, IndexedDB ou ocultação de botões como autenticação confiável. A autorização entre usuários e dispositivos depende de backend integrado.

## Escopo
- `index.html`: nova casca, navegação, cabeçalho, modais e referências de cache.
- `app.js`: inicialização, navegação, backups automáticos, ações globais e bloqueio de sessão da Inteligência.
- `views.js`: telas operacionais, dashboard, relatórios, cadastros, auditoria, lixeira e configurações.
- `db.js`: IndexedDB, auditoria, lixeira, contadores e backups, sem alteração de regras.
- `helpers.js`: formatação, segurança de HTML, tooltips, gráficos e downloads.
- `excel-report.js`: relatório Excel XML com abas analíticas.
- `styles.css`: nova identidade, cartões, painéis, tabelas, formulários e responsividade.
- `sw.js`/`manifest.webmanifest`: cache e instalação PWA.

## Decisões de design
**Estilos considerados:** console logístico claro (0,06), cockpit escuro de frota (0,04), dashboard SaaS genérico (0,03). Escolhido: console logístico claro, com azul-marinho, azul moderno, ciano, branco e grafite.

- **Movimento:** sala de controle operacional com hierarquia de informação, não um painel decorativo.
- **Princípios:** prioridade visível; números com contexto; ações seguras; leitura confortável em celular.
- **Cores:** azul-marinho para navegação, azul para ação, ciano para informação, verde para conclusão e vermelho reservado a exceções.
- **Layout:** nova casca de central operacional, com áreas monitorar/executar/organizar, cabeçalho contextual, painéis de ação e conteúdo selecionável.
- **Assinaturas:** chips de estado, faixa executiva de saúde e cards com barra semântica.
- **Interação:** ações destrutivas continuam pedindo motivo; filtros preservam contexto; tooltips explicam métricas.
- **Animação:** curta e funcional; respeita `prefers-reduced-motion`.
- **Tipografia:** sistema nativo, números tabulares e títulos compactos para alta densidade.
- **Essência:** operação de entregas offline-first para equipas que precisam decidir rápido e deixar rastreabilidade.

## Regras novas
- Não exibir escolha de perfil ou operador.
- Manter perfil administrativo interno para que todos os fluxos existentes continuem disponíveis.
- A proteção local da Central de Inteligência é apenas uma barreira de interface e não substitui autenticação server-side.
- O armazenamento local é adequado para operação offline, mas não oferece controle de acesso entre dispositivos.

## Preservação
`db.js`, `views.js`, `helpers.js` e `excel-report.js` continuam sendo a base funcional. A lógica de negócio, cálculos, banco, cadastros, entregas, ciclos, frota, quilometragem, custos, relatórios, auditoria, lixeira, backups, filtros e exportações permanecem preservados.
