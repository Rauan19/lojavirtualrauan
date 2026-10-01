# Comissão por venda — teste e ativação

O código está pronto e **desligado** (`PLATFORM_FEE_ENABLED="false"`). Este é o
roteiro para testar no sandbox do Mercado Pago e ligar aos poucos.

## Como funciona (resumo)

1. No pagamento, a API calcula `taxa do plano × (produtos − desconto)` (sem
   frete), grava no pedido e manda para o MP (`application_fee` no Brick,
   `marketplace_fee` no Checkout Pro).
2. O MP separa a comissão na hora: o lojista recebe o resto, a Vendira recebe a
   comissão na conta dona do app.
3. O webhook põe uma tarefa na fila (pg-boss). A tarefa relê o pagamento no MP e
   lança no livro (`PlatformFeeEntry`) o que foi **de fato** retido: cobrança,
   estornos proporcionais, chargeback.
4. Retido ≠ calculado → pedido marcado como divergente (Super Admin →
   Comissões) e alerta no Sentry.
5. A comissão só é cobrada de loja com **Mercado Pago conectado pelo botão** e
   **termos novos aceitos**. Faltando um dos dois: até o prazo
   (`PLATFORM_FEE_OAUTH_DEADLINE`) vende sem comissão; depois, o pagamento é
   recusado.

## 1. Teste no sandbox (antes de ligar em produção)

Precisa de: app do MP com credenciais **de teste**, um usuário de teste
**vendedor** e um **comprador** (Suas integrações → Contas de teste).

- [ ] `.env` local: `MP_OAUTH_TEST="true"`, `PLATFORM_FEE_ENABLED="true"`.
- [ ] Loja de teste num plano com taxa (ex.: Começo, 2%), termos aceitos.
- [ ] Conectar o vendedor de teste pelo botão "Conectar com Mercado Pago".
- [ ] **Pix** de R$ 100 em produtos + frete → no MP, `application_fee` = R$ 2,00
      (frete fora). Painel do lojista → pedido mostra "Taxa Vendira −R$ 2,00".
- [ ] **Cartão** (Brick) → mesma coisa.
- [ ] **Checkout Pro** → mesma coisa (`marketplace_fee`).
- [ ] Com **cupom**: taxa sobre produtos − desconto.
- [ ] **Estorno parcial** pelo painel do MP (ex.: 50%) → livro com REFUND de
      metade da taxa.
- [ ] **Estorno total** pelo painel da loja → livro zera.
- [ ] Webhook repetido (reenviar no painel do MP) → nada duplica.
- [ ] Super Admin → Comissões: totais do mês e CSV batem com o MP.
- [ ] Chargeback (se o sandbox permitir): confirmar se o MP devolve a
      `application_fee`. O código hoje considera a comissão perdida — se o MP
      não devolver, ajustar `livro.ts` (bloco do chargeback).
- [ ] Loja desconectada, com prazo passado → checkout mostra "pagamento
      temporariamente indisponível".

## 2. Produção

1. Deploy com `npx prisma migrate deploy` (Node 22+).
2. `.env` da VPS: `MP_OAUTH_TEST="false"`, `PLATFORM_FEE_ENABLED="false"`,
   `PLATFORM_FEE_OAUTH_DEADLINE` = hoje + 30 dias (ex.: `2026-11-30`).
3. Avisar as lojas por e-mail (30 dias, como dizem os termos). No painel elas já
   veem o aviso dos termos novos e a faixa "Conecte seu Mercado Pago até …".
4. **Liberar aos poucos** — Super Admin → Comissões → coluna "Cobrança":
   - marcar 1 ou 2 lojas conhecidas como **Ligada**;
   - acompanhar alguns dias: valores no MP × relatório, divergências zeradas;
   - depois `PLATFORM_FEE_ENABLED="true"` (todas), deixando como **Desligada**
     só quem tiver motivo.
5. Todo mês: Super Admin → Comissões → **Baixar CSV** → emitir a NFS-e das
   comissões por loja.

## Botões de emergência

- Uma loja com problema: Comissões → Cobrança → **Desligada** (vale já no
  próximo pagamento, inclusive de pedido que estava esperando pagar).
- Todas: `PLATFORM_FEE_ENABLED="false"` e reiniciar o PM2.
