# Fotos das lojas-modelo da landing

Coloque aqui as fotos originais (tamanho grande, sem recortar) e rode:

```
npm run lp:fotos
```

O script corta, converte para WebP e grava em `public/lp/`. Foto que faltar é
ignorada — a arte que já está lá continua valendo, então dá pra ir trocando aos
poucos.

## Nomes esperados

A extensão pode ser `.jpg`, `.jpeg`, `.png` ou `.webp`. O nome tem que ser
exatamente um destes:

### Ateliê Lua — moda e acessórios (sai em retrato 3:4)

| arquivo                | o que procurar                               |
| ---------------------- | -------------------------------------------- |
| `lp-moda-vestido`      | vestido floral, manequim ou modelo           |
| `lp-moda-camisa`       | camisa de linho manga curta, azul            |
| `lp-moda-tenis`        | tênis branco com sola caramelo               |
| `lp-moda-bone`         | boné aba curva lavado, **sem logo de time**  |
| `lp-moda-mochila`      | mochila de canvas com detalhe em couro       |
| `lp-moda-tenis-lilas`  | tênis leve feminino, tom claro               |

### Eletro Vale — eletro e eletrodomésticos (sai em quadrado)

| arquivo                  | o que procurar                             |
| ------------------------ | ------------------------------------------ |
| `lp-eletro-celular`      | smartphone de frente, fundo branco         |
| `lp-eletro-tv`           | smart TV com a tela ligada                 |
| `lp-eletro-geladeira`    | geladeira duplex, **sem logo de marca**    |
| `lp-eletro-fogao`        | fogão 4 bocas                              |

## Licença

Use fontes com licença livre para uso comercial — Unsplash e Pexels servem, e
nenhuma das duas exige atribuição. Evite foto com marca visível (logo de
fabricante), porque a landing é material de venda da plataforma e não temos
autorização de uso de marca de terceiro.

## Dica de enquadramento

Prefira foto com o produto centralizado e sobra de fundo em volta: o script
corta pelo centro de interesse, mas foto muito justa perde parte do produto no
formato quadrado.
