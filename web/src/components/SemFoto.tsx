/**
 * Produto sem foto. Toda loja nova começa assim, então isto não pode parecer
 * "imagem quebrada": é uma capa tipográfica na cor da loja, com o nome do
 * produto. Fica bonita sozinha e some quando o lojista sobe a foto.
 *
 * - `capa`: preenche o quadro do cartão ou da foto principal;
 * - `mini`: miniatura (sacola, Compre junto, pedidos), só a inicial.
 */
export function SemFoto({
  nome,
  variante = 'capa',
}: {
  nome: string;
  variante?: 'capa' | 'mini';
}) {
  const inicial = nome.trim().charAt(0).toUpperCase() || '·';
  if (variante === 'mini') {
    return (
      <span aria-hidden className="sem-foto sem-foto-mini">
        {inicial}
      </span>
    );
  }
  return (
    <span aria-hidden className="sem-foto sem-foto-capa">
      <span className="sem-foto-inicial">{inicial}</span>
      <span className="sem-foto-nome">{nome}</span>
    </span>
  );
}
