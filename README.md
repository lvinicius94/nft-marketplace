# Kurio · Marketplace de NFTs

Solução do [Desafio Frontend — Marketplace de NFTs](https://github.com/junglegaming/frontend-challenge): descoberta, compra e conta do colecionador, em desktop e mobile, seguindo o layout do Figma. Toda a API (REST e Socket.IO) é simulada com **MSW**, tanto em desenvolvimento quanto na demonstração publicada e nos testes.

- **Demo:** https://lucascamargo-nft-marketplace.vercel.app (os mocks e o tempo real funcionam no ambiente publicado)
- **Arquitetura, contratos e decisões:** [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- **Auditoria Lighthouse:** [`lighthouse/summary.md`](./lighthouse/summary.md) (relatórios HTML/JSON em `lighthouse/reports`)

## Stack

React 19 · TypeScript · Vite · TanStack Router · TanStack Query · Axios · Socket.IO (`socket.io-client`) · Tailwind CSS v4 · shadcn/ui (Radix) · MSW 2 + `@mswjs/socket.io-binding` · Playwright · Lighthouse

## Setup

Requisitos: Node 20+ (testado com Node 22.20) e npm.

```bash
npm ci
npx playwright install chromium   # só para os testes E2E
npm run dev                        # http://localhost:5173, com mocks
```

A aplicação roda a partir de um checkout limpo e não depende de nenhum serviço externo.

## Variáveis de ambiente

Veja `.env.example`. Nenhuma é obrigatória.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` | Ativa o MSW (REST + Socket.IO). Fica ligado também no build de demonstração. |
| `VITE_REALTIME_URL` | `wss://realtime.greenmint.test` | Endpoint Socket.IO interceptado pelo MSW. |

## Credenciais fictícias

| Usuário | E-mail | Senha | Observação |
| --- | --- | --- | --- |
| Ana Prado | `ana@greenmint.test` | `Colecionador@1` | Tem 2 carteiras (Ethereum e Polygon) e favoritos |
| Bruno Lima | `bruno@greenmint.test` | `Colecionador@2` | Sem carteiras: bom para testar o cadastro de carteiras |

As senhas ficam no mock apenas como hash SHA-256 com salt; nunca em texto puro. Cupons: `GREEN10` (10%), `BEMVINDO5` (5%), `LucasCamargo` (15%, promoção de Black Friday do primeiro slide, que leva ao NFT lendário Golden Snub #001) e `BLACK30` (expirado). Os códigos não diferenciam maiúsculas de minúsculas.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Desenvolvimento com mocks |
| `npm run build` | Verificação de tipos + build de produção (com mocks) |
| `npm run preview` | Serve o build em http://localhost:4173 |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright (Chromium, desktop 1440px e mobile 390px). Faz o build e sobe o preview sozinho |
| `npm run test:e2e:update` | Regenera as baselines de regressão visual |
| `npm run test:e2e:report` | Abre o relatório HTML (traces das falhas em `test-results/`) |
| `npm run lighthouse` | Auditoria: início e detalhe, mobile e desktop, 3 execuções, mediana. Exige `npm run preview` rodando |

## Cenários e reset dos mocks

Os cenários são determinísticos (dados com semente fixa e latência pseudoaleatória reproduzível). Há três formas de escolher um:

1. **Painel "Mocks"** (botão no canto inferior esquerdo): escolhe o cenário, reseta os dados e dispara eventos do servidor simulado.
2. **URL:** `?scenario=<nome>`, por exemplo `/?scenario=slow`. A escolha fica salva para os próximos carregamentos.
3. **Testes/console:** `window.__mocks.setScenario('<nome>')`.

| Cenário | Efeito |
| --- | --- |
| `default` | Sucesso, latência de 250 ms |
| `fast` | Sem latência (usado nos testes) |
| `slow` | 3 s por requisição (skeletons) |
| `variable` | Latência variável de 100 a 2500 ms, com semente |
| `out-of-order` | Listagens antigas respondem depois das novas |
| `empty` | Catálogo vazio |
| `catalog-error` | Catálogo responde 500 na primeira vez (o retry automático recupera) |
| `catalog-unavailable` | Catálogo sempre 503 (estado de erro com "Tentar novamente") |
| `offline` | Sem conexão: REST e socket falham |
| `session-short` | Sessão expira em 30 s |
| `favorites-fail` | Favoritar/desfavoritar respondem 500 (rollback otimista) |
| `payment-declined` | O pagamento é recusado |
| `order-timeout` | O pedido é criado, mas a resposta chega depois do timeout do cliente |
| `price-change` | 2 s após a primeira cotação, o preço do 1º item do carrinho sobe |
| `sold-out` | 2 s após a primeira cotação, a edição do 1º item esgota |

**Reset:** use o botão "Resetar dados" do painel ou `window.__mocks.reset()`. O banco simulado é recriado a partir das fixtures e a sessão local é limpa.

## Como reproduzir os fluxos de falha

| Fluxo | Passos |
| --- | --- |
| Preço muda durante a compra | Adicione um NFT, vá ao pagamento e, no painel, clique em **Subir preço (carrinho)**. Também dá para usar o cenário `price-change`. O resumo atualiza via Socket.IO, a revisão é cancelada e a confirmação fica bloqueada até você **Aceitar novos preços**. |
| Edição esgota | Painel → **Esgotar edição (carrinho)**, ou cenário `sold-out`. |
| Timeout com recuperação | Cenário `order-timeout` → confirme a compra. O cliente desiste após 8 s, reenvia com a mesma `Idempotency-Key` e recupera o mesmo pedido. |
| Clique repetido | Na revisão, clique várias vezes em **Confirmar e assinar**: só um pedido é criado. |
| Pagamento recusado | Cenário `payment-declined`. Os itens continuam no carrinho. |
| Pedido pendente + queda do socket | Cenário `default`, confirme a compra e, no painel, clique em **Alternar queda do realtime**. Depois reative ou recarregue a página: o estado é reconciliado via REST, sem nova compra. |
| Eventos duplicados ou antigos | Painel → **Reenviar último evento** ou **Enviar evento antigo**. Nada regride. |
| Sessão expirada | Painel → **Expirar sessões** e navegue para uma área privada ou mude a rede no pagamento. Você volta ao login e depois retorna ao mesmo ponto, com o rascunho do pagamento preservado. |
| Falha e nova tentativa | Cenário `catalog-unavailable`, depois troque para `default` e clique em **Tentar novamente**. |
| Carteira recusa a conexão | No pagamento → **Conectar carteira** → **Recusar**. |

## Testes E2E

São 40 testes por viewport, cobrindo os 12 grupos do enunciado. Todos rodam contra o build de produção com MSW. Cada teste começa num contexto isolado: `localStorage` limpo e banco simulado recém-semeado.

- `e2e/catalog.spec.ts`: busca, filtros combinados, ordenação, paginação, histórico, vazio, URL inválida, skeleton lento, falha + retry, respostas fora de ordem
- `e2e/detail-favorites.spec.ts`: acesso direto, 404, edição indisponível, limite de quantidade, favoritos persistentes, falha com rollback
- `e2e/auth.spec.ts`: cadastro (validação e conflito), login, expiração na navegação e no checkout, logout, troca de usuário
- `e2e/cart-checkout.spec.ts`: carrinho, cupom, persistência, mesclagem ao logar, precisão de ETH, compra completa, recibo imutável, clique repetido, recusa, timeout com idempotência, carteira (recusa e desconexão)
- `e2e/realtime.spec.ts`: preço e estoque via Socket.IO no checkout, duplicados e antigos, queda com pedido pendente, isolamento por usuário
- `e2e/account-a11y.spec.ts`: perfil, avatar, senha, carteiras; teclado, foco em diálogos, erros associados, overflow horizontal
- `e2e/visual.spec.ts`: regressão visual de início, detalhe, carrinho e pagamento (baselines em `e2e/__screenshots__`)

As baselines visuais foram geradas no Windows com Chromium. Em outro sistema operacional, as diferenças de renderização de fonte exigem `npm run test:e2e:update`.
