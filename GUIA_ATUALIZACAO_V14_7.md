# Atualização V14.7.1 • roteirização e visual para celular

## Publicação

1. Faça um Backup JSON no sistema atual.
2. Publique os arquivos da V14.7.1 na raiz do GitHub Pages.
3. Abra o sistema com internet e confirme que o rodapé mostra **V14.7.1**.
4. No computador que já possui os dados, entre na conta e aguarde a mensagem **Sincronizado em tempo real**.
5. Depois abra o sistema no celular.

## Preparação da rota

1. Acesse **Cadastros > Regras**.
2. Confira o ponto de saída e retorno do mercado.
3. Confira a cidade usada pelo Google Maps.
4. Acesse **Cadastros > Bairros** e defina a ordem de atendimento de cada bairro.

Números menores aparecem primeiro no roteiro, exceto quando existe entrega prioritária.

## Cadastro da entrega

- Bairro continua obrigatório.
- Rua/avenida e número são recomendados para o Google Maps localizar a porta do cliente.
- Complemento e referência ajudam o entregador, mas não alteram o cálculo do mapa.
- Ao marcar **Entrega prioritária**, a NF fica no começo do roteiro do ciclo.

Se uma entrega antiga tiver somente o bairro, ela não é bloqueada: o mapa usa uma parada aproximada pelo bairro e o roteiro avisa que falta o endereço exato.

## Montagem do ciclo

1. Toque em **Montar nova saída**.
2. Selecione as entregas.
3. Confira o quadro **Roteiro sugerido**.
4. Confirme a saída.
5. No cartão do ciclo, use **Rota no Google Maps**.

A ordem aplicada é:

1. entregas prioritárias;
2. ordem configurada dos bairros;
3. endereço dentro do bairro;
4. horário de entrada como desempate.

## Internet e modo offline

- A lista e a ordem do roteiro ficam salvas no aplicativo e podem ser consultadas offline.
- Para abrir o Google Maps e calcular as ruas, é necessário estar conectado à internet.
- Entregas e ciclos lançados offline continuam na fila e sincronizam quando a conexão voltar.

## Uso no celular

A barra inferior oferece acesso rápido à Central, Ciclos, Nova compra e Menu. Os formulários passam para uma coluna e os botões principais ficam maiores para reduzir erros de toque.
