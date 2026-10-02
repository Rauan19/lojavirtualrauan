# Vendira: sistema visual

Referência: padrão das plataformas grandes (Nuvemshop; Shopify como régua de
acabamento). Ver PRODUCT.md para o porquê. Tokens em `web/src/app/globals.css`.

## Duas camadas de marca
- **Vendira** (site `/`, entrar/criar conta, painel `/admin`, Super Admin):
  cores da logo.
- **Lojista** (vitrine `/loja/<slug>`): cor e logo de cada loja, via
  `--store-accent`, `--store-primary`, `--store-font*`. A marca Vendira não
  aparece na vitrine.

## Cores (Vendira)
| Token | Valor | Uso |
|---|---|---|
| `--brand-deep` | `#0d3a43` | Áreas grandes da marca: hero, login, faixa final, item ativo do menu, foco |
| `--brand-teal` | `#3fa2b4` | Halo atrás dos aparelhos, detalhes; nunca texto |
| `--brand-coral` | `#ea5e6d` | Destaque em texto grande sobre o turquesa escuro, ícones de check |
| `--accent` | `#d43d54` | Botão de ação principal (coral escurecido, passa contraste) |
| `--ok` | `#1b8f4a` | Pix, frete grátis, sucesso |
| `--ink` / `--muted` / `--line` | `#171a1f` / `#4a5560` / `#d9dde3` | Texto, texto secundário, filetes |

Estratégia: **comprometida** nas telas de convencer (hero, login: o turquesa
escuro ocupa a tela), **contida** no painel (neutros + turquesa só no que está
ativo/focado).

## Cores (vitrine do lojista)
- `--store-accent-ink`: texto sobre a cor da loja, branco ou preto, calculado
  (`web/src/lib/contraste.ts`).
- `--store-accent-text`: a cor da loja como texto, escurecida até 4,5:1.
- Qualquer cor nova de destaque na vitrine passa por esses dois.

## Tipografia
- Marca/títulos de convencer: Manrope 800 (`--font-brand`), `text-balance`.
- Interface: Barlow (`--font-display`).
- Vitrine: fonte do preset da loja.
- Mínimo 11px em qualquer texto; 12–13px para linhas de apoio.

## Forma
- Cartões do painel e do login: canto 14–22px, sombra suave e curta.
- Botões: pílula (`999px`) no login/cadastro; 10px no painel; vitrine segue o
  tema da loja (quadrado).
- Campos: 46px de altura no login; foco com anel turquesa.
- Área de toque mínima de 40–44px no celular.

## Padrões que se repetem
- **Sem foto** (`SemFoto.tsx`): capa tipográfica na cor (loja na vitrine,
  turquesa no painel). Nunca cinza com "Sem imagem".
- **Prova no lugar de foto de banco**: a vitrine funcionando
  (`StorefrontMockup`, `StoreDeviceShowcase`) ao lado de login e hero.
- **Confiança perto do botão de comprar** (`GarantiasCompra.tsx`) e frete pelo
  CEP (`CalcularFrete.tsx`).
- Erros com `role="alert"`; estados vazios dizem o próximo passo.

## Evitar
- Etiqueta/rótulo pequeno acima de título.
- Texto gradiente, vidro decorativo, borda colorida grossa de um lado.
- Termos técnicos para lojista ou comprador.
