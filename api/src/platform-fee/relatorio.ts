import { BadRequestException } from '@nestjs/common';

/**
 * Mês civil no horário de Brasília (UTC−3, sem horário de verão desde 2019).
 * Uma venda às 23h do dia 31 é do mês 31, não do mês seguinte em UTC.
 */
export function intervaloDoMes(mes?: string): {
  mes: string;
  inicio: Date;
  fim: Date;
} {
  let ano: number;
  let m: number;
  if (mes) {
    const ok = /^(\d{4})-(\d{2})$/.exec(mes);
    if (!ok) throw new BadRequestException('Mês inválido (use AAAA-MM)');
    ano = Number(ok[1]);
    m = Number(ok[2]);
    if (m < 1 || m > 12 || ano < 2020 || ano > 2100) {
      throw new BadRequestException('Mês inválido (use AAAA-MM)');
    }
  } else {
    const agoraBr = new Date(Date.now() - 3 * 3600 * 1000);
    ano = agoraBr.getUTCFullYear();
    m = agoraBr.getUTCMonth() + 1;
  }
  const inicio = new Date(Date.UTC(ano, m - 1, 1, 3));
  const fim = new Date(Date.UTC(ano, m, 1, 3));
  return { mes: `${ano}-${String(m).padStart(2, '0')}`, inicio, fim };
}

/** Uma célula de CSV: aspas quando precisa e sem fórmula (CSV injection). */
export function celulaCsv(valor: string | number | null | undefined): string {
  let s = valor == null ? '' : String(valor);
  // Número negativo ("-1,80") é valor, não fórmula
  if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(,\d+)?$/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Centavos → "1234,56" (planilha brasileira). */
export function reaisCsv(centavos: number): string {
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
