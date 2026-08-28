export type ViaCepResult = {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

export function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

export function isCepLengthValid(value: string) {
  return onlyDigits(value).length === 8;
}

/** Consulta ViaCEP. Retorna null se CEP inexistente/inválido. */
export async function lookupViaCep(
  raw: string,
): Promise<ViaCepResult | null> {
  const digits = onlyDigits(raw);
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    cep?: string;
  };
  if (data.erro || !data.localidade || !data.uf) return null;
  return {
    zipCode: formatCep(digits),
    street: (data.logradouro || '').trim(),
    neighborhood: (data.bairro || '').trim(),
    city: (data.localidade || '').trim(),
    state: (data.uf || '').trim().toUpperCase(),
  };
}
