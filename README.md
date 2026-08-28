# Loja Virtual na Mensalidade

Plataforma **white-label** de e-commerce: você vende lojas por mensalidade; cada loja tem admin, clientes, produtos, Mercado Pago próprio e identidade visual.

## Estrutura

```
api/                 → NestJS + Prisma + PostgreSQL
web/                 → Next.js (vitrine + painéis)
docker-compose.yml   → Postgres
```

## Começar (dev)

1. Postgres:

```bash
docker compose up -d
```

2. API:

```bash
cd api
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run prisma:seed
npm run start:dev
```

> Por padrão o seed usa senhas fracas só em desenvolvimento. Em produção **não** rode o seed com senhas default — ou troque imediatamente.

3. Front:

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

- Front: http://localhost:3000  
- API: http://localhost:3001/api (ajuste `API_PROXY_TARGET` / `PORT` conforme seu setup)

## Checklist produção

### Obrigatório

1. `NODE_ENV=production`
2. `JWT_SECRET` forte e único
2b. `ENCRYPTION_KEY` (32 bytes) — cifra os tokens de gateway no banco. Gere com
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    guarde FORA do banco e rode `npm run secrets:encrypt` uma vez.
    Perder a chave = perder os tokens salvos das lojas.
3. `PUBLIC_URL` HTTPS da API (webhooks MP)
4. `MP_WEBHOOK_SECRET` definido
5. No painel MP: webhook de **pedidos** + webhook de **recorrência (billing)** — ver tabela abaixo
6. `PLATFORM_MP_*` opcional no .env — preferência: salvar no **Super Admin** (Mercado Pago da plataforma)
7. `CORS_ORIGINS` com a URL do front da plataforma
8. `FRONTEND_URL` com a URL pública do Next
9. `PLATFORM_HOSTS` com os hosts do app (não dos clientes)
10. Access Token + Public Key **produção** (`APP_USR-…`) em cada loja
11. SMTP (`SMTP_HOST` / user / pass / from) para “esqueci a senha”
12. Trocar senhas de qualquer conta seed

### Recomendado

- `ME_WEBHOOK_SECRET` se usar Melhor Envio
- Domínio próprio: DNS → front; campo “Domínio próprio” no admin (hostname sem `https://`)
- Checkout: preferir **Brick**; se usar Pro, credenciais produção usam `init_point` (não sandbox)
- HTTPS no reverse proxy (Nginx/Caddy/Cloudflare)
- Backup do Postgres **e** da pasta `uploads/` (as imagens ficam em disco)

### Ainda manual / futuro

- SEO da vitrine (sitemap, robots, Open Graph, JSON-LD)
- Impressora Bluetooth: hoje o modo BLUETOOTH cai no mesmo caminho do
  navegador (imprimir pelo sistema); não há Web Bluetooth implementado
- Cadastro self-service de lojista (hoje só o Super Admin cria loja)
- Limites por plano no backend (nº de produtos, pedidos/mês, domínio próprio)
- E-mails de cobrança (vence em X dias / cartão recusado / loja suspensa)

## Domínio customizado

1. Lojista grava `minhaloja.com.br` em Admin → Identidade  
2. DNS A/CNAME aponta para o servidor do **Next**  
3. Middleware reescreve o host → `/loja/{slug}/…`  
4. API libera CORS automaticamente para esse host  

## Webhooks

| Gateway | Uso | URL |
|--------|-----|-----|
| Mercado Pago | Pedidos das lojas (cliente final) | `{PUBLIC_URL}/api/payments/webhooks/mercadopago?secret={MP_WEBHOOK_SECRET}&store={storeId}` |
| Mercado Pago | **Mensalidade recorrente** (lojista → plataforma) | `{PUBLIC_URL}/api/billing/webhooks/mercadopago?secret={MP_WEBHOOK_SECRET}` |
| Melhor Envio | Rastreio | `{PUBLIC_URL}/api/shipping/webhooks/melhor-envio?secret={ME_WEBHOOK_SECRET}` |

**Pedidos:** o `&store=` faz o webhook resolver a loja em uma única chamada à API do MP. Sem ele, cada notificação precisa ser testada contra o token de todas as lojas cadastradas. A URL certa (já com o id) aparece em Admin → Configurações → Mercado Pago; é ela que o lojista deve cadastrar no painel dele.

**Recorrência:** no painel MP da **conta da plataforma** (`PLATFORM_MP_ACCESS_TOKEN`), cadastre a URL de billing. Eventos: `subscription_preapproval`, `subscription_authorized_payment`, `payment`.

Mensalidade do lojista: `/admin/settings/planos` (Assinaturas MP).

## Etiqueta do Melhor Envio

Loja no modo `melhor_envio` compra e emite a etiqueta pela própria plataforma
(carrinho → pagamento com o saldo do lojista → emissão → PDF), e o código de
rastreio entra sozinho no pedido.

- **Manual:** botão "Gerar etiqueta" no pedido pago.
- **Automático:** Configurações → Frete → "Gerar etiqueta automaticamente".
  Desligado por padrão porque **gasta saldo real** da conta do lojista.

Emitir duas vezes é bloqueado: pedido que já tem etiqueta devolve a existente
em vez de comprar outra. Requer endereço de origem completo e CPF/CNPJ do
lojista — a API recusa antes de chamar o Melhor Envio, dizendo o que falta.

## Régua de cobrança

Roda sozinha de hora em hora (`BillingCronService`), sem depender de ninguém abrir tela:

| Situação | Status | Efeito |
|---|---|---|
| Em dia | `ACTIVE` / `TRIAL` | tudo liberado |
| `planDueAt` venceu | `PAST_DUE` | painel do lojista vira **somente leitura** (só `/admin/settings/planos` e as rotas de billing aceitam escrita). **A vitrine continua vendendo** |
| Vencido há mais de `BILLING_GRACE_DAYS` (padrão 7) | `SUSPENDED` | loja inteira fora do ar, vitrine incluída |

O bloqueio é aplicado no `TenantGuard`, não só no front — chamar a API direto com o token não contorna. O guard também trata como atrasada uma loja com `planDueAt` vencido que ainda não foi marcada, então uma falha do agendador não libera acesso de graça.

## Testes

```bash
cd api && npm run test:all
```

- **Unitários** (`npm test`) — sanitização de HTML, criptografia dos segredos, bloqueio de rede interna. Não precisam de banco.
- **E2E** (`npm run test:e2e`) — sobem a aplicação inteira contra o banco `lojavirtual_test`, criado e migrado automaticamente. Cobrem os caminhos onde bug custa dinheiro: frete forjado, reserva de estoque, webhook duplicado, corrida pelo último item, bloqueio de inadimplência, isolamento entre lojas, XSS nas políticas, revogação de sessão e SSRF na impressora.

O e2e usa `TEST_DATABASE_URL` (padrão `postgresql://postgres:postgres@localhost:5432/lojavirtual_test`). Ele **apaga as tabelas entre os testes** — nunca aponte para o banco de desenvolvimento.

Detalhes da API em [`api/README.md`](api/README.md).
