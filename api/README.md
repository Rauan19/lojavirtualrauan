# Loja Virtual White-Label (API)

Backend NestJS multi-tenant: cada cliente tem a própria loja, produtos, pedidos e identidade visual. Sem API de IA.

## Stack

- NestJS 11
- Prisma 7 + PostgreSQL
- JWT (roles: SUPER_ADMIN, STORE_ADMIN, CUSTOMER)
- Upload local em `uploads/{storeId}/`
- Mercado Pago por loja (dinheiro vai para a conta da loja)
- Frete manual no MVP (Melhor Envio depois)

## Setup

1. Na raiz do projeto, sobe o Postgres:

```bash
docker compose up -d
```

2. Copiar env (já aponta pro container):

```bash
cp .env.example .env
```

3. Instalar e migrar:

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev
```

API: `http://localhost:3000/api`  
Super admin seed: `admin@plataforma.com` / `admin123`

## Multi-tenant

Envie o header em rotas da loja:

```http
X-Store-Slug: slug-da-loja
```

Ou resolva por domínio customizado / subdomínio.

## Rotas principais

| Método | Rota | Quem |
|--------|------|------|
| POST | `/api/auth/login` | todos |
| GET | `/api/auth/me` | autenticado |
| POST | `/api/stores` | super admin |
| GET | `/api/stores` | super admin |
| PATCH | `/api/stores/:id/status` | super admin (plano/mensalidade) |
| GET | `/api/stores/public/:slug` | público |
| GET/PATCH | `/api/stores/me/*` | admin da loja |
| CRUD | `/api/admin/products` | admin da loja |
| CRUD | `/api/admin/categories` | admin da loja |
| POST | `/api/admin/uploads` | admin da loja (multipart `file`) |
| GET | `/api/admin/orders` | admin da loja |
| GET | `/api/admin/dashboard/summary` | admin da loja |
| GET | `/api/catalog/products` | vitrine |
| POST | `/api/shipping/quote` | vitrine |
| POST | `/api/checkout/orders` | vitrine |
| POST | `/api/checkout/orders/:id/pay` | Mercado Pago preference |
| POST | `/api/payments/webhooks/mercadopago` | webhook MP |

## Fluxo rápido

1. Login super admin → cria loja (`POST /stores`) com admin
2. Login admin da loja (header `X-Store-Slug`)
3. Configura branding + tokens MP
4. Cadastra categorias/produtos + upload de imagens
5. Cliente cria pedido no checkout → gera preference MP
6. Webhook atualiza pagamento; admin vê pedidos e dashboard

## Observações

- Mensalidade da plataforma: no MVP o super admin muda `status` da loja (`ACTIVE` / `PAST_DUE` / `SUSPENDED`)
- Imagens ficam na VPS em `uploads/`; depois troca o storage por S3/R2
- Nenhuma integração com API de IA
