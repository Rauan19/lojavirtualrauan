# Segurança do servidor (VPS) — checklist

O código foi auditado (ver o fim deste arquivo). O que sobra de risco de
vazamento ou invasão está quase todo **na configuração do servidor**. Faça
estes passos uma vez, na ordem, num VPS Ubuntu.

> Antes de mexer no SSH, deixe **uma segunda janela de SSH aberta**. Se errar
> alguma coisa, ainda dá para corrigir por ela.

## 1. Acesso ao servidor (SSH)

- [ ] Entrar só com **chave SSH**, nunca com senha:
  ```bash
  ssh-copy-id usuario@IP_DO_VPS          # no seu computador
  ```
  No VPS, em `/etc/ssh/sshd_config`:
  ```
  PasswordAuthentication no
  PermitRootLogin no
  ```
  ```bash
  sudo systemctl restart ssh
  ```
- [ ] Usar um usuário comum com `sudo`, não o `root`.
- [ ] **fail2ban** bloqueia quem erra a senha várias vezes:
  ```bash
  sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban
  ```

## 2. Firewall: só as portas necessárias

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

- [ ] As portas **3000 (site), 3001 (API) e 5432 (banco) não podem ficar abertas
  para a internet**. Só o Nginx (80/443) fala com o mundo.
- [ ] Conferir: `sudo ss -tlnp` — Node e Postgres devem aparecer em
  `127.0.0.1`, não em `0.0.0.0`.
- [ ] No painel da Hostinger, o firewall do VPS com as mesmas regras.

## 3. Banco de dados (PostgreSQL)

- [ ] Escutando só local: em `postgresql.conf`, `listen_addresses = 'localhost'`.
- [ ] Senha forte e usuário próprio da aplicação (não usar o `postgres`):
  ```sql
  CREATE USER vendira WITH PASSWORD 'senha-longa-gerada';
  CREATE DATABASE lojavirtual OWNER vendira;
  ```
- [ ] **Backup diário fora do servidor** (Cloudflare R2), compactado, guardando
  30 dias. Testar a restauração uma vez por mês.

## 4. Segredos (`.env`)

- [ ] Só o usuário da aplicação lê o arquivo:
  ```bash
  chmod 600 api/.env web/.env.local
  ```
- [ ] Valores fortes e únicos em produção: `JWT_SECRET` (48+ bytes),
  `ENCRYPTION_KEY` (32 bytes), `MP_WEBHOOK_SECRET`, `ME_WEBHOOK_SECRET`.
  Gerar com:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- [ ] **Guardar uma cópia da `ENCRYPTION_KEY` fora do servidor** (gerenciador de
  senhas). Sem ela, os tokens das lojas salvos no banco não abrem.
- [ ] **Trocar o Client Secret do Mercado Pago**: o atual foi colado num chat.
- [ ] Nunca subir `.env` para o GitHub (já está no `.gitignore`).

## 5. Nginx e HTTPS

- [ ] HTTPS com certificado (Let's Encrypt via `certbot`, ou o da Cloudflare).
- [ ] Repassar o IP real do visitante para a API:
  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
  }
  ```
- [ ] `TRUST_PROXY_HOPS` no `api/.env`:
  - `1` — só Nginx na frente;
  - `2` — Cloudflare com a nuvem **laranja** (proxy) + Nginx.
- [ ] **Não gravar a query string nos logs** do Nginx: o webhook do Mercado Pago
  leva o segredo nela (`?secret=`). Formato de log sem `$args`:
  ```nginx
  log_format semquery '$remote_addr - [$time_local] "$request_method $uri" $status $body_bytes_sent';
  access_log /var/log/nginx/access.log semquery;
  ```
- [ ] Limite de tamanho de envio igual ao da API: `client_max_body_size 6m;`

## 6. Cloudflare (recomendado)

- [ ] DNS com a nuvem laranja ligada: esconde o IP do VPS e barra ataques.
- [ ] SSL/TLS em **Full (strict)**.
- [ ] Com a nuvem laranja, aceitar conexão na porta 443 **só dos IPs da
  Cloudflare** (lista em cloudflare.com/ips). Sem isso, quem descobrir o IP do
  VPS fala direto com ele e pula a proteção.
- [ ] Regra de limite de requisições no login (`/api/auth/*`) como segunda camada.

## 7. Atualizações

- [ ] Atualizações de segurança automáticas do Ubuntu:
  ```bash
  sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
  ```
- [ ] Rodar `npm audit --omit=dev` em `api` e `web` todo mês.
- [ ] Node 22 LTS atualizado.

## 8. Contas e acessos

- [ ] Super Admin com senha longa e única (gerenciador de senhas).
- [ ] Verificação em duas etapas (2FA) em: GitHub, Hostinger, Cloudflare,
  Mercado Pago, e-mail da empresa. **Quem entra nessas contas entra em tudo.**
- [ ] Trocar as senhas de qualquer conta criada pelo `seed` de desenvolvimento.

## 9. Monitoramento

- [ ] `SENTRY_DSN` configurado (erros chegam por e-mail).
- [ ] Monitor externo de disponibilidade em `https://SEU_DOMINIO/api/public/health`
  (UptimeRobot ou Better Stack, plano grátis).

---

## Auditoria do código — outubro de 2026

**Corrigido nesta auditoria**

| Achado | Gravidade | Correção |
|---|---|---|
| IP do visitante lido do 1º valor do `X-Forwarded-For`, que o cliente escreve: o registro de acesso (Marco Civil) e o aceite dos termos gravavam o IP que o atacante quisesse | Média | A API usa o IP calculado pelo Express a partir dos proxies confiáveis |
| Número de proxies fixo em 1: com Cloudflare + Nginx, todo visitante teria o IP da Cloudflare e o limite de requisições viraria um só para a plataforma inteira | Média | `TRUST_PROXY_HOPS` configurável (1 = Nginx; 2 = Cloudflare + Nginx) |
| `sharp` 0.34.5 com falhas na libvips/libheif (imagens enviadas pelo lojista) | Alta | Atualizado para 0.35.5 (API e site) |
| `nodemailer` 9.1.1 com falhas de negação de serviço por endereço de e-mail malicioso | Alta | Atualizado para 10.0.13 |
| Site sem cabeçalhos de segurança: painel podia ser aberto dentro de outro site (clickjacking) | Média | `frame-ancestors 'self'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS em produção, sem `X-Powered-By` |
| Dados da comissão no JSON do pedido enviado ao cliente | Média | Removidos das respostas ao cliente (commit `7974bc7`) |
| Bibliotecas de build (`brace-expansion`, `fast-uri`, `nanoid`) | Baixa | `npm audit fix` |

**Conferido e sem problema**

- SQL: só consultas parametrizadas; nenhuma montada com texto do usuário.
- Todas as rotas que alteram dados exigem login e perfil (guarda no controller).
- Isolamento entre lojas coberto por testes de ponta a ponta.
- Validação estrita (campos desconhecidos são recusados); erros em produção sem detalhes internos.
- OAuth do Mercado Pago e do Melhor Envio com `state` assinado (HMAC) e válido por 10 minutos; retorno sempre para o próprio site.
- Webhook de pagamento: segredo comparado em tempo constante e pagamento sempre reconsultado no Mercado Pago (aviso falso não aprova pedido).
- Tokens das lojas cifrados (AES-256-GCM); nenhum segredo real no repositório nem no histórico.
- Upload: limite de 5 MB e de pixels, arquivo precisa ser imagem de verdade, GPS removido.

**Riscos aceitos (por enquanto)**

| Risco | Por que aceitar agora | Quando resolver |
|---|---|---|
| PostCSS dentro do Next 15 (leitura de arquivo via CSS malicioso) | Só afeta o build, que processa CSS nosso | Na migração para o Next 16 |
| Alerta do `prisma`/`deepmerge-ts` | Ferramenta de linha de comando, não roda no servidor em produção | Próxima versão do Prisma |
| Token de login no `localStorage` do navegador | Só seria roubado com uma falha de XSS; HTML das lojas já é limpo e o React escapa o resto | Avaliar cookie `httpOnly` junto com o 2FA |
| Super Admin sem verificação em duas etapas | Uma conta só, com senha forte | Antes de ter funcionários com acesso |
