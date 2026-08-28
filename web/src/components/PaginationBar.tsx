'use client';

type Props = {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
  label?: string;
};

function pageWindow(current: number, total: number, size = 5) {
  if (total <= size) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const half = Math.floor(size / 2);
  let start = Math.max(1, current - half);
  let end = start + size - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - size + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
  className = '',
  label = 'itens',
}: Props) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);

  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 ${className}`}
      aria-label="Paginação"
    >
      <p className="text-xs text-muted">
        Página {page} de {totalPages}
        {typeof total === 'number' ? ` · ${total} ${label}` : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ← Anterior
        </button>
        {pages[0] > 1 ? (
          <>
            <button
              type="button"
              className="min-w-8 rounded px-2 py-1.5 text-xs font-semibold ring-1 ring-line"
              onClick={() => onPageChange(1)}
            >
              1
            </button>
            {pages[0] > 2 ? (
              <span className="px-1 text-xs text-muted">…</span>
            ) : null}
          </>
        ) : null}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`min-w-8 rounded px-2 py-1.5 text-xs font-semibold ${
              p === page
                ? 'bg-ink text-white'
                : 'ring-1 ring-line hover:bg-zinc-50'
            }`}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ))}
        {pages[pages.length - 1] < totalPages ? (
          <>
            {pages[pages.length - 1] < totalPages - 1 ? (
              <span className="px-1 text-xs text-muted">…</span>
            ) : null}
            <button
              type="button"
              className="min-w-8 rounded px-2 py-1.5 text-xs font-semibold ring-1 ring-line"
              onClick={() => onPageChange(totalPages)}
            >
              {totalPages}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima →
        </button>
      </div>
    </nav>
  );
}
