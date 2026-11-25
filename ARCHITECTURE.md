# Arquitetura

## Visão geral

```
src/
  api/          contracts.ts (tipos compartilhados) · client.ts (Axios + erros) · endpoints.ts · queries.ts (TanStack Query)
  auth/         session-store.ts (sessão local) · session-sync.tsx (cache × sessão × navegação)
  realtime/     socket.ts (cliente Socket.IO + aplicação versionada dos eventos) · provider.tsx
  features/     checkout-attempt.ts (idempotência e retomada do pedido)
  pages/        telas (carregadas sob demanda pelo TanStack Router)
  components/   layout, cards, formulários e componentes shadcn/ui (Radix) adaptados ao tema
  mocks/        db.ts (servidor simulado) · handlers/rest.ts · handlers/realtime.ts · scenarios.ts · fixtures/
  lib/          eth.ts (aritmética decimal) · format.ts · announcer.ts (live regions)
```

A UI nunca contém respostas fictícias. Componentes e hooks só conversam com a API via Axios e Socket.IO; o MSW intercepta na camada de rede. O painel "Mocks" e o `window.__mocks` alteram **o servidor simulado**, e a interface só recebe essas mudanças pelas respostas REST e pelos eventos do socket.

## Contratos REST

Base `/api`. Autenticação: `Authorization: Bearer <token>`. O carrinho do visitante é identificado por `X-Cart-Id`. Os tipos estão em `src/api/contracts.ts`, compartilhados entre Axios, Query e MSW.

| Método e rota | Corpo / parâmetros | Resposta |
| --- | --- | --- |
| `POST /auth/register` | `{ username, email, password }` | `201 Session` · `409 EMAIL_TAKEN/USERNAME_TAKEN` · `422` |
| `POST /auth/login` | `{ email, password }` | `Session` · `401 INVALID_CREDENTIALS` |
| `GET /auth/session` | — | `{ user, expiresAt }` · `401 SESSION_EXPIRED` |
| `POST /auth/logout` | — | `204` |
| `GET /nfts` | `q, tab, category[], chain[], minPrice, maxPrice, sort, page, pageSize` | `NftListResponse` (itens, paginação, facetas, faixa de preço) |
| `GET /nfts/:id` | — | `NftDetail` · `404` |
| `GET /favorites` · `PUT/DELETE /favorites/:nftId` | — | `{ nftIds }` |
| `GET /cart` | — | `Cart` (com resumo calculado no servidor) |
| `POST /cart/items` | `{ nftId, editionId, quantity }` | `Cart` · `409 OUT_OF_STOCK/QUANTITY_LIMIT` |
| `PATCH /cart/items/:nftId/:editionId` | `{ quantity }` | `Cart` |
| `DELETE /cart/items/:nftId/:editionId` | — | `Cart` |
| `PUT /cart/coupon` · `DELETE /cart/coupon` | `{ code }` | `Cart` · `422 COUPON_INVALID/COUPON_EXPIRED` |
| `POST /cart/acknowledge-prices` | — | `Cart` (aceita os preços atuais) |
| `POST /quotes` | `{ network }` | `201 Quote` (linhas, cupom, subtotal, desconto, taxa, total, `issues`) |
| `POST /orders` | `Idempotency-Key` + `{ quoteId, walletId, network, buyer }` | `201 Order` (novo) · `200 Order` (mesma chave e mesmo corpo) · `409 IDEMPOTENCY_MISMATCH/QUOTE_CHANGED/OUT_OF_STOCK` |
| `GET /orders` · `GET /orders/:id` | — | `Order[]` · `Order` · `403` (pedido de outro usuário) |
| `GET /me` · `PUT /me` | `{ name, username, email, ensName, walletNickname, avatarDataUrl? }` | `User` · `409` · `422` |
| `POST /me/password` | `{ currentPassword, newPassword }` | `204` · `422` |
| `GET /wallets` · `PUT /wallets/:role` | `WalletInput` (`role` = `primary`/`secondary`) | `Wallet[]` · `409` (endereço repetido) · `422` |
| `POST /wallets/:id/connect` | `{ network, simulate: 'approve' \| 'reject' }` | `WalletConnection` · `403` (recusa) |

Formato de erro: `{ error: { code, message, fields?, details? } }`. Os códigos cobrem validação (422), sessão inválida ou expirada (401), permissão (403), inexistente (404), conflito (409) e falha transitória (500/503). O Axios normaliza tudo em `ApiError`, incluindo `NETWORK` e `TIMEOUT` para falhas sem resposta. A flag `transient` decide os retries.

**ETH:** todo valor trafega como string decimal (`"1.19"`). Os cálculos (`src/lib/eth.ts`) usam `bigint` em wei (18 casas), sem ponto flutuante. Quantidades são inteiras. A **cotação** (`POST /quotes`) é a referência para fechar o pedido.

## Eventos (Socket.IO)

Envelope comum:

```ts
{ eventId, type, resourceId, version, userId /* null = público */, occurredAt, payload }
```

| Evento | Payload | Efeito no cliente |
| --- | --- | --- |
| `nft.updated` | `{ nftId, priceEth, available, editions }` | Atualiza detalhe e páginas do catálogo em cache (só se `version` for maior), invalida o carrinho, o que recalcula a cotação, e anuncia a mudança |
| `order.updated` | `{ order }` | Atualiza o pedido em cache (só versão maior), invalida a lista de pedidos e, se confirmado, o carrinho |

Regras de ordem e idempotência (`RealtimeClient.accept`): cada `eventId` é aplicado uma única vez, e eventos com `version` menor ou igual à última aplicada para o recurso são descartados. Assim, duplicados e eventos antigos não regridem estado nem reaplicam efeitos.

Eventos privados (`order.updated`) só chegam ao socket autenticado como dono, por filtro no servidor, e o cliente ainda descarta `userId` diferente do usuário atual. Ao trocar de usuário, o cliente emite `session.leave` e `session.join` com o novo token e limpa a lista de eventos vistos.

**Reconciliação:** a cada `connect` (inclusive reconexões), o cliente invalida todas as queries ativas de catálogo, carrinho e dados privados. Assim, eventos perdidos durante a queda são recuperados via REST. Os listeners são removidos quando os componentes desmontam (`useRealtimeEvent`) e no `stop()` do cliente.

### Transporte simulado e limitações

- Usa o `socket.io-client` real, com `transports: ['websocket']`. O MSW (`ws.link`) intercepta o WebSocket e o `@mswjs/socket.io-binding` codifica e decodifica os pacotes Engine.IO/Socket.IO.
- O binding só suporta o namespace padrão e o transporte WebSocket (sem long-polling, rooms ou broadcast). O escopo por usuário é feito no handler.
- O binding não expõe o payload de autenticação do handshake. Por isso o cliente se autentica com o evento `session.join`.
- O binding não envia heartbeat do Engine.IO. O handler envia ping (`"2"`) a cada 20 s para o cliente não derrubar a conexão.
- O `engine.io-client` captura `globalThis.WebSocket` quando o módulo é avaliado. Por isso ele fica num chunk carregado com `import()` **depois** de `worker.start()` (`src/main.tsx` e `manualChunks` em `vite.config.ts`). Os parsers compartilhados com o binding ficam no chunk do MSW.
- O servidor simulado roda na própria aba. Se a página for recarregada com um pedido pendente, o `resumePendingOrders()` liquida o pedido quando a hora já passou ou rearma o timer.

## Política de sessão

- Login e cadastro devolvem `{ token, expiresAt, user }`, guardados em `localStorage` (nunca a senha). A sessão sobrevive ao refresh e é validada no boot (`GET /auth/session`).
- Rotas privadas (`/pagamento`, `/pedido/*`, `/perfil/*`) têm guarda no `beforeLoad` do TanStack Router, que redireciona para `/entrar?redirect=<href>`.
- Um 401 de uma requisição feita **com o token atual** encerra a sessão como "expirada". Respostas 401 atrasadas de tokens antigos são ignoradas, porque não podem derrubar um login novo. Se o usuário estiver numa área privada, volta ao login e depois retorna ao mesmo ponto.
- O rascunho do pagamento fica em `sessionStorage` por usuário. A tentativa de pedido (chave e corpo) também, o que permite retomar após a expiração.
- **Logout e troca de usuário:** `SessionSync` remove todas as queries `['user', <id>]` e o carrinho do usuário anterior. O socket sai da sessão antiga e entra na nova. A chave do carrinho de visitante é trocada após a mesclagem.

## Estado do carrinho

- O carrinho é estado do **servidor**. O visitante usa um id próprio (`X-Cart-Id`, guardado em `localStorage`), então o carrinho sobrevive ao refresh. No login ou cadastro, o servidor mescla os itens do visitante no carrinho da conta, respeitando estoque e limite por pedido.
- Cada item guarda `addedPriceEth`. Se o preço atual diferir, a interface avisa e bloqueia o checkout até o usuário aceitar os novos preços (`POST /cart/acknowledge-prices`). Estoque insuficiente também bloqueia.
- O resumo (subtotal, desconto, taxa estimada e total) vem calculado da API. No pagamento, os valores vêm da **cotação** da rede escolhida.
- Depois da confirmação, o servidor remove do carrinho apenas as quantidades compradas. Em caso de recusa ou falha, os itens são preservados e o estoque reservado é devolvido.

## Pedido, idempotência e recuperação

1. "Confirmar compra" valida o formulário e a carteira conectada e abre a **revisão** com a cotação atual.
2. Se a cotação mudar durante a revisão (evento `nft.updated` → nova cotação), a revisão fecha e exige nova confirmação.
3. "Confirmar e assinar" cria a tentativa `{ key: uuid, body }` em `sessionStorage` e envia `POST /orders` com `Idempotency-Key`. Cliques repetidos são ignorados (ref + botão desabilitado).
4. Falhas transitórias (timeout, rede, 5xx) geram nova tentativa automática, até 3 vezes, com a **mesma chave**, e o servidor devolve o pedido já criado. Se a página recarregar sem resposta, o checkout oferece "Retomar pedido" com a mesma chave.
5. O servidor revalida preço, estoque, cupom e taxa contra a cotação (`fingerprint`). Se algo mudou: `409 QUOTE_CHANGED`/`OUT_OF_STOCK` com a cotação nova, e a interface pede nova revisão.
6. `/pedido/:id` mostra o estado pendente, confirmado ou recusado. Estados terminais não mudam. O recibo só aparece com `status === 'confirmed'` e reproduz o snapshot gravado no pedido; mudanças posteriores no catálogo não o alteram.

## Cache, retries e sincronização (TanStack Query)

| Item | Política |
| --- | --- |
| `staleTime` | 30 s (padrão). Cotação: 0, sempre refeita quando o carrinho muda |
| `gcTime` | 5 min |
| Retries de queries | Até 2, só para erros transitórios, com backoff de 500 ms × 2ⁿ (máx. 3 s). Erros 4xx não são repetidos |
| Retries de mutations | Desligados, exceto a criação de pedido, que repete manualmente com a mesma chave de idempotência |
| Respostas obsoletas | Cada combinação de parâmetros tem sua própria chave, e o `AbortSignal` do Query cancela a requisição anterior. `keepPreviousData` evita piscar; a contagem só aparece com dados da consulta atual |
| Isolamento | Dados privados em `['user', userId, …]`; carrinho em `['cart', 'user:<id>' \| 'guest:<id>']` |
| Invalidação | Mutations do carrinho gravam a resposta do servidor no cache; `409` invalida carrinho e catálogo; `order.updated` invalida pedidos e carrinho; reconexão invalida tudo que está ativo |
| Otimista | Favoritos: atualização imediata, rollback ao snapshot em caso de falha (ou descarte, se a lista ainda não tinha carregado) e revalidação no `onSettled` |
| Polling | Só como rede de segurança: o pedido pendente é consultado a cada 10 s. O canal principal é o Socket.IO |

## Acessibilidade

- Link "Pular para o conteúdo"; foco visível em todo controle (`:focus-visible`).
- Diálogos e drawers (Radix) prendem o foco e o devolvem ao gatilho ao fechar; Escape fecha.
- Campos com `<label>`, `aria-invalid` e `aria-describedby` apontando para a mensagem de erro. Ao enviar com erro, o foco vai para o primeiro campo inválido. O asterisco de obrigatório fica fora do `<label>`, e o `required` do controle é o que se anuncia.
- Regiões `aria-live` (polite/assertive) anunciam mutations e mudanças em tempo real.
- Estados não dependem só de cor: edição esgotada aparece riscada e com borda tracejada, mais o texto "Esgotada"; botões de favorito usam `aria-pressed`.
- Skeletons com shimmer preservam as dimensões e desligam a animação com `prefers-reduced-motion`. No mobile, `scroll-padding-bottom` evita que a barra inferior fixa cubra o elemento focado.

## Performance (Lighthouse, mediana de 3 execuções)

Resultado completo em [`lighthouse/summary.md`](./lighthouse/summary.md). Configuração em `scripts/lighthouse.mjs`: build otimizado, cenário padrão dos mocks, Lighthouse 13.6, Chrome headless, perfis mobile (padrão: 4G lento e CPU 4×) e desktop.

| Página | Perfil | Perf. | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Início | mobile | 93 | 100 | 100 | 100 | 3,18 s | 0,021 | 54 ms |
| Início | desktop | 100 | 100 | 100 | 100 | 0,72 s | 0,002 | 0 ms |
| Detalhe | mobile | 94 | 100 | 100 | 100 | 3,13 s | 0 | 7 ms |
| Detalhe | desktop | 100 | 100 | 100 | 100 | 0,71 s | 0 | 0 ms |

Medidas aplicadas: rotas com code splitting; MSW num chunk carregado em paralelo via `modulepreload`, para não criar uma cascata de downloads antes da primeira renderização; imagens WebP em 400 e 800 px com `width`/`height` e `fetchpriority` na imagem do LCP, com preload responsivo no `index.html`; fonte Roboto Mono variável servida localmente; altura mínima no `main` contra deslocamento do rodapé (corrigiu o CLS de 0,17 no detalhe).

O LCP mobile de cerca de 3,1 s vem principalmente da exigência de os mocks estarem ativos no build auditado: a primeira renderização espera o `worker.start()` do MSW, cerca de 100 KB gzip. Sem mocks, esse custo não existiria. Não houve simplificações exclusivas para a auditoria.

## Decisões de UX e desvios do Figma

- **Assets:** o arquivo do Figma é somente leitura. As 4 ilustrações foram recortadas do export 3x do frame "Desktop / Início" e salvas em WebP (`public/nfts`); os frames exportados estão em `design/frames` como referência. O ícone do recibo ("THANK YOU") foi trocado pelo `MailOpen` do Lucide. Os destaques do rodapé usam `ShieldCheck`, `Sparkles` e `BellRing`; os ícones de redes sociais, Google e compartilhamento foram desenhados no mesmo traço da Lucide (`src/components/brand-icons.tsx`), porque a Lucide 1.x não traz ícones de marca.
- **Fonte:** Roboto Mono (variável, local), a mais próxima da tipografia monoespaçada do layout.
- **Cores:** amostradas dos PNGs exportados (tokens em `src/styles.css`).
- **Login e cadastro:** no desktop são diálogos sobre a home, como no layout; no mobile, telas cheias, como nos frames mobile.
- **Pagamento:** os campos "Endereço", "ENS ou carteira secundária" e "Tipo de carteira" vêm da carteira cadastrada selecionada e são somente leitura, porque o pedido precisa referenciar uma carteira real. "Usar outra carteira?" leva ao cadastro de carteiras, preservando o rascunho. Foram acrescentados o botão "Conectar carteira" (com aprovação e recusa simuladas), a desconexão e o diálogo de **revisão** antes do envio, exigidos pelo enunciado e ausentes no layout.
- **Rede × carteira:** cada carteira pertence a uma rede (Ethereum, Polygon ou Solana). Ao escolher a rede, só as carteiras compatíveis ficam habilitadas. Endereços Solana são validados em base58.
- **Carteiras:** o formulário segue todos os campos do frame. "Igual à carteira principal" copia os dados da principal para a secundária, alterando o endereço para não duplicar.
- **Fora do escopo:** Criadores, Aprenda, Ofertas, Arquivos baixados, Suporte, newsletter, login social e recuperação de senha mostram um aviso "não faz parte desta demonstração", sem simular sucesso.
- **"Atividade" e "Lista de interesse"** do perfil foram implementadas como histórico de pedidos e favoritos.
- **Carrossel do hero:** slides empilhados na mesma célula do grid com fade de opacidade (1 s, sem deslocamento), então título e botão não se movem e a altura não varia; troca sozinho a cada 2 s, pausa com mouse ou foco dentro dele e fica parado com `prefers-reduced-motion` (WCAG 2.2.2). Título, botão e indicadores têm posição fixa entre os slides. Os testes rodam com movimento reduzido para serem determinísticos.
- **Black Friday (extra):** o primeiro slide promove o **Golden Snub #001**, NFT lendário da coleção Kurio Originals, com arte autoral do criador da demo, e o cupom `LucasCamargo` (15%). O botão do slide leva direto ao produto. Ele é o anúncio mais antigo do catálogo, para não alterar a ordem da primeira página do layout.
- **Tiers de raridade (extra):** Comum, Raro, Épico e Lendário. Cada tier tem um selo com gradiente e cantos arredondados no card e no detalhe; o texto do selo garante leitura sem depender de cor.
- **`<select>` customizável:** nos navegadores Chromium com `appearance: base-select`, a lista usa a paleta do site (sem o azul do sistema operacional). Nos demais, a lista nativa usa as cores escuras.
- **Faixa de preço:** valores em ETH com 2 casas e botão "Aplicar"; os limites vêm da API.
- **Painel "Mocks":** controle de demonstração e teste do servidor simulado, visível só com mocks ativos.
