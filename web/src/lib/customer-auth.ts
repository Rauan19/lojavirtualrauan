'use client';

export type StoreCustomer = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  cpf?: string | null;
  storeId: string;
};

function tokenKey(slug: string) {
  return `lv_customer_token_${slug}`;
}

function userKey(slug: string) {
  return `lv_customer_user_${slug}`;
}

export function saveCustomerSession(
  slug: string,
  token: string,
  customer: StoreCustomer,
) {
  localStorage.setItem(tokenKey(slug), token);
  localStorage.setItem(userKey(slug), JSON.stringify(customer));
}

export function clearCustomerSession(slug: string) {
  localStorage.removeItem(tokenKey(slug));
  localStorage.removeItem(userKey(slug));
}

/** Remove todas as sessões de cliente (todas as lojas). */
export function clearAllCustomerSessions() {
  if (typeof window === 'undefined') return;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('lv_customer_')) localStorage.removeItem(key);
  }
}

export function getCustomerToken(slug: string) {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(tokenKey(slug));
}

export function getCustomer(slug: string): StoreCustomer | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(userKey(slug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoreCustomer;
  } catch {
    return null;
  }
}
