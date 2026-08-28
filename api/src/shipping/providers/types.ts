export type ShipOption = {
  id: string;
  name: string;
  price: number;
  days: number;
  company?: string;
  raw?: unknown;
};

export type QuoteProduct = {
  id?: string;
  quantity: number;
  price: number;
  weight?: number; // kg
  width?: number; // cm
  height?: number; // cm
  length?: number; // cm
};

export type QuoteContext = {
  fromZip: string;
  toZip: string;
  subtotal: number;
  products: QuoteProduct[];
  token: string;
  sandbox?: boolean;
  contactEmail?: string;
};

export function defaultProducts(subtotal: number): QuoteProduct[] {
  return [
    {
      id: '1',
      quantity: 1,
      price: Math.max(subtotal, 1),
      weight: 0.5,
      width: 16,
      height: 10,
      length: 20,
    },
  ];
}

export function normalizeZip(zip: string) {
  return zip.replace(/\D/g, '').slice(0, 8);
}
