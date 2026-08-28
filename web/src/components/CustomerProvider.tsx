'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '@/lib/api';
import { clearSession } from '@/lib/auth';
import {
  clearCustomerSession,
  getCustomer,
  getCustomerToken,
  saveCustomerSession,
  type StoreCustomer,
} from '@/lib/customer-auth';

export type CustomerAddress = {
  id: string;
  label?: string | null;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
};

type CustomerContextValue = {
  slug: string;
  customer: StoreCustomer | null;
  token: string | null;
  addresses: CustomerAddress[];
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => void;
  setAddresses: (list: CustomerAddress[]) => void;
};

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function CustomerProvider({
  storeSlug,
  children,
}: {
  storeSlug: string;
  children: React.ReactNode;
}) {
  const [customer, setCustomer] = useState<StoreCustomer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = getCustomerToken(storeSlug);
    if (!t) {
      setCustomer(null);
      setToken(null);
      setAddresses([]);
      setLoading(false);
      return;
    }
    try {
      const me = await api<{
        id: string;
        email: string;
        name: string;
        phone?: string | null;
        cpf?: string | null;
        storeId: string;
        addresses?: CustomerAddress[];
      }>('/storefront/auth/me', { token: t, storeSlug });
      const c: StoreCustomer = {
        id: me.id,
        email: me.email,
        name: me.name,
        phone: me.phone,
        cpf: me.cpf ?? null,
        storeId: me.storeId,
      };
      saveCustomerSession(storeSlug, t, c);
      setCustomer(c);
      setToken(t);
      setAddresses(me.addresses || []);
    } catch {
      clearCustomerSession(storeSlug);
      setCustomer(null);
      setToken(null);
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    setCustomer(getCustomer(storeSlug));
    setToken(getCustomerToken(storeSlug));
    void refresh();
  }, [storeSlug, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{
        accessToken: string;
        customer: StoreCustomer;
      }>('/storefront/auth/login', {
        method: 'POST',
        storeSlug,
        body: { email, password },
      });
      // Não misturar com sessão de admin da loja / plataforma
      clearSession();
      saveCustomerSession(storeSlug, res.accessToken, res.customer);
      setToken(res.accessToken);
      setCustomer(res.customer);
      await refresh();
    },
    [storeSlug, refresh],
  );

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      phone?: string;
    }) => {
      const res = await api<{
        accessToken: string;
        customer: StoreCustomer;
      }>('/storefront/auth/register', {
        method: 'POST',
        storeSlug,
        body: data,
      });
      clearSession();
      saveCustomerSession(storeSlug, res.accessToken, res.customer);
      setToken(res.accessToken);
      setCustomer(res.customer);
      await refresh();
    },
    [storeSlug, refresh],
  );

  const logout = useCallback(() => {
    clearCustomerSession(storeSlug);
    setCustomer(null);
    setToken(null);
    setAddresses([]);
  }, [storeSlug]);

  const value = useMemo(
    () => ({
      slug: storeSlug,
      customer,
      token,
      addresses,
      loading,
      refresh,
      login,
      register,
      logout,
      setAddresses,
    }),
    [
      storeSlug,
      customer,
      token,
      addresses,
      loading,
      refresh,
      login,
      register,
      logout,
    ],
  );

  return (
    <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) {
    throw new Error('useCustomer deve ser usado dentro de CustomerProvider');
  }
  return ctx;
}
