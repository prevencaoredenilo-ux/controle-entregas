# V4 — Fluxo operacional corrigido

# V3 Premium — Quilometragem diária e ciclos

# Controle de Entregas • Nova Xavantina — PWA Offline V1

Aplicativo web responsivo para gestão anual de entregas, frota, custos, ciclos, programadas, reagendadas, pendências, bairros, colaboradores e relatórios.

## O que já funciona

- Dashboard por ano, mês, semana ou período personalizado.
- Entregas com cupom, bairro, taxa, veículo, entregador e ciclo.
- Tempo da compra até a saída considerando expediente 09:00–13:00 e 14:00–20:00.
- Atraso automático acima de 2 horas úteis.
- Tempo da saída até a entrega ao cliente.
- Tempo total da saída até o retorno à loja.
- Programadas e reagendadas por Data Programada.
- Início de atendimento no dia programado com continuidade rastreável.
- Central automática de pendências.
- Ciclos com quantidade de entregas, KM e duração.
- Custos detalhados por data, veículo, categoria, descrição, valor, KM, fornecedor e responsável.
- Custo por entrega, custo por KM, combustível por entrega e saldo operacional.
- Análise por bairro: mais entregas, maior faturamento, endereço errado, agendamentos, reagendamentos, devoluções, atrasos e taxas.
- Rastreio de cupom com linha do tempo.
- Relatórios por dia, semana, mês, ano e período personalizado.
- Exportação de relatório compatível com Excel em `.xls`, com múltiplas abas.
- Cadastro, edição, desativação e reativação de veículos, bairros, colaboradores, categorias e motivos.
- Backup e restauração em JSON.
- PWA instalável e operação offline após o primeiro carregamento.

## Dados nesta versão

Os dados são armazenados no IndexedDB do próprio navegador/aparelho. Isso permite operação offline e evita depender de uma planilha.

**Importante:** nesta V1 os dados ainda não sincronizam automaticamente entre celulares e computadores diferentes. Para uso multiusuário e sincronização em tempo real, conecte um backend central em uma próxima etapa.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. Vá em **Settings → Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/root`.
6. Salve.

O app será publicado em um endereço no formato:

`https://seuusuario.github.io/nome-do-repositorio/`

## Arquivos principais

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icons/icon-192.png`
- `icons/icon-512.png`


## V2 — lançamento simplificado e faturamento corrigido

- Nova compra em poucos campos.
- Taxa entra no faturamento no registro da compra.
- Reagendamentos não duplicam receita.
- Retirada na loja pode ter reembolso zero, total ou parcial.
- Dashboard mostra faturamento bruto, reembolsos e faturamento líquido.
- Operação do dia usa botões rápidos: Saiu, Entregue, Retornou, Reagendar, Retirada e Devolvida.


## Novidades da V3
- KM inicial e final por veículo e por dia.
- KM total por dia, semana, mês, ano e período personalizado.
- Média de KM por ciclo calculada a partir do KM diário real.
- Média de KM por entrega.
- Ciclos sem necessidade de digitar KM em cada saída.
- Tela exclusiva de Quilometragem e cards na Operação do Dia.
- Alertas para fechamento de KM pendente e KM final menor que o inicial.
- Exportação Excel com aba ODOMETRO_DIARIO.


## Regra oficial de quilometragem e ciclos

- **KM inicial:** registrado uma única vez por veículo antes de começar o expediente.
- **KM final:** registrado uma única vez por veículo quando termina o expediente.
- **KM do dia:** KM final menos KM inicial.
- **Ciclo:** cada saída da loja até o retorno ao mercado.
- Uma saída pode levar uma ou várias entregas. Todas ficam vinculadas ao mesmo ciclo.
- **Entregas por ciclo:** entregas levadas no período divididas pela quantidade de ciclos.
- **KM médio por ciclo:** KM diário do período dividido pela quantidade de ciclos.
- **KM por entrega:** KM do período dividido pelas entregas levadas.

A V4 cria o ciclo automaticamente ao montar uma saída e exige baixa das entregas antes de fechar o retorno, evitando pontas soltas.
