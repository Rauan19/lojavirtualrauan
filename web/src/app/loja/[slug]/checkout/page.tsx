'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CartProvider, useCart } from '@/components/CartProvider';
import {
  useCustomer,
  type CustomerAddress,
} from '@/components/CustomerProvider';
import { MpPaymentBrick, type BrickPayerAddress } from '@/components/MpPaymentBrick';
import {
  OfflinePaymentPanel,
  type OfflinePaymentInfo,
} from '@/components/OfflinePaymentPanel';
import { PaymentStatusScreen } from '@/components/PaymentStatusScreen';
import { api, thumbUrl, money } from '@/lib/api';
import { cartLineKey, type CartItem } from '@/lib/cart';
import {
  formatDeliveryDaysHint,
  formatDeliveryEstimate,
} from '@/lib/shipping-display';
import { SemFoto } from '@/components/SemFoto';

type Store = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  checkoutMode?: string;
  paymentsEnabled?: boolean;
  mpPublicKey?: string | null;
};

type ShipOption = {
  id: string;
  name: string;
  price: number;
  days: number;
};

type CouponResult = {
  valid: boolean;
  code: string;
  type?: string;
  discount: string | number;
  freeShipping?: boolean;
  description?: string | null;
};

type Step = 1 | 2 | 3 | 4;

type BrickSession = {
  orderId: string;
  amount: number;
  /** Preço no Pix com o desconto da loja (vem do servidor) */
  pixAmount?: number;
  pixDiscountPercent?: number;
  publicKey: string;
  payerEmail?: string;
  payerName?: string;
  payerAddress?: BrickPayerAddress;
};

const emptyAddr = {
  label: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

export default function CheckoutPage() {
  const params = useParams<{ slug: string }>();
  return (
    <CartProvider storeSlug={params.slug}>
      <CheckoutInner slug={params.slug} />
    </CartProvider>
  );
}

function CheckoutInner({ slug }: { slug: string }) {
  const router = useRouter();
  const cart = useCart();
  const {
    customer,
    token,
    addresses,
    loading: authLoading,
    refresh,
  } = useCustomer();

  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState('');
  const [recuperado, setRecuperado] = useState('');

  /*
   * Link do e-mail de carrinho abandonado (?recuperar=...): devolve os itens
   * do pedido que expirou para a sacola e tira o parâmetro da barra.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('recuperar');
    if (!token) return;
    let cancelado = false;
    api<{
      itens: (Omit<CartItem, 'quantity'> & { quantity: number })[];
      faltando: number;
    }>(`/storefront/recuperar-carrinho/${encodeURIComponent(token)}`, {
      storeSlug: slug,
    })
      .then((r) => {
        if (cancelado) return;
        const naSacola = new Set(cart.items.map((i) => cartLineKey(i)));
        for (const item of r.itens) {
          if (!naSacola.has(cartLineKey(item))) cart.add(item);
        }
        setRecuperado(
          r.itens.length === 0
            ? 'Os produtos daquele pedido não estão mais disponíveis.'
            : r.faltando > 0
              ? 'Recuperamos sua sacola. Alguns itens não estão mais disponíveis.'
              : 'Recuperamos sua sacola. É só finalizar.',
        );
      })
      .catch(() => {
        if (!cancelado) setRecuperado('Este link não vale mais.');
      })
      .finally(() => {
        params.delete('recuperar');
        const resto = params.toString();
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${resto ? `?${resto}` : ''}`,
        );
      });
    return () => {
      cancelado = true;
    };
    // Só ao abrir a página pelo link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [brickSession, setBrickSession] = useState<BrickSession | null>(null);
  /** Com desconto no Pix, o cliente escolhe o meio antes do formulário */
  const [metodo, setMetodo] = useState<'pix' | 'cartao' | null>(null);
  useEffect(() => {
    setMetodo(null);
  }, [brickSession?.orderId]);
  const temDescontoPix = Boolean(
    brickSession &&
      (brickSession.pixDiscountPercent ?? 0) > 0 &&
      (brickSession.pixAmount ?? brickSession.amount) < brickSession.amount,
  );
  const valorEscolhido = brickSession
    ? metodo === 'pix' && temDescontoPix
      ? (brickSession.pixAmount ?? brickSession.amount)
      : brickSession.amount
    : 0;
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [offlinePay, setOfflinePay] = useState<OfflinePaymentInfo | null>(null);

  const [phone, setPhone] = useState('');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [addrForm, setAddrForm] = useState(emptyAddr);
  const [saveAddress, setSaveAddress] = useState(true);

  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);
  const [shipId, setShipId] = useState('');
  const [quoting, setQuoting] = useState(false);

  const [couponCode, setCouponCode] = useState('');
  const [aceitou, setAceitou] = useState(false);
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  /** Desconto do "Compre junto" (o servidor calcula com os preços dele) */
  const [descontoCombo, setDescontoCombo] = useState(0);
  const chaveDoCarrinho = cart.items
    .map((i) => `${i.productId}:${i.variantId || ''}:${i.quantity}`)
    .join('|');

  useEffect(() => {
    if (cart.items.length < 2) {
      setDescontoCombo(0);
      return;
    }
    let vivo = true;
    api<{ desconto: number }>('/storefront/compre-junto/desconto', {
      method: 'POST',
      storeSlug: slug,
      body: {
        items: cart.items.map((i) => ({
          productId: i.productId,
          ...(i.variantId ? { variantId: i.variantId } : {}),
          quantity: i.quantity,
        })),
      },
    })
      .then((r) => vivo && setDescontoCombo(r.desconto || 0))
      .catch(() => vivo && setDescontoCombo(0));
    // O cupom foi validado sobre outro valor: pede para aplicar de novo
    setCoupon(null);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, chaveDoCarrinho]);

  useEffect(() => {
    api<Store>(`/stores/public/${slug}`)
      .then(setStore)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro'));
  }, [slug]);

  // Checkout exige conta: sem login, manda pra tela de entrar e volta pra cá.
  useEffect(() => {
    if (authLoading) return;
    if (!customer) {
      router.replace(
        `/loja/${slug}/conta/entrar?next=${encodeURIComponent(`/loja/${slug}/checkout`)}`,
      );
      return;
    }
    setPhone(customer.phone || '');
    setStep(2);
  }, [authLoading, customer, router, slug]);

  useEffect(() => {
    if (!addresses.length) return;
    const preferred =
      addresses.find((a) => a.isDefault) || addresses[0];
    setAddressId((prev) => prev || preferred.id);
  }, [addresses]);

  const selectedAddress: CustomerAddress | null = useMemo(() => {
    if (!addressId) return null;
    return addresses.find((a) => a.id === addressId) || null;
  }, [addresses, addressId]);

  const activeZip = editingNew
    ? addrForm.zipCode
    : selectedAddress?.zipCode || '';

  const selectedShip = useMemo(
    () => shipOptions.find((o) => o.id === shipId) || null,
    [shipOptions, shipId],
  );

  const authToken = token;

  const discount = coupon && !coupon.freeShipping ? Number(coupon.discount) : 0;
  const shippingCost = coupon?.freeShipping ? 0 : (selectedShip?.price ?? 0);
  const total = Math.max(
    0,
    cart.subtotal - descontoCombo - discount + shippingCost,
  );

  useEffect(() => {
    if (!authToken || !brickSession || (!awaitingConfirm && !watchingPayment))
      return;
    let cancelled = false;
    const orderId = brickSession.orderId;

    async function poll() {
      try {
        const o = await api<{
          paymentStatus: string;
          status: string;
        }>(`/storefront/orders/${orderId}`, {
          token: authToken,
          storeSlug: slug,
        });
        if (cancelled) return;
        const ok =
          o.paymentStatus === 'APPROVED' ||
          ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status);
        if (ok) {
          setPaymentDone(true);
          setAwaitingConfirm(false);
          setWatchingPayment(false);
          setOfflinePay(null);
          setBusy(false);
          cart.clear();
        }
      } catch {
        /* ignore poll errors */
      }
    }

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, brickSession?.orderId, awaitingConfirm, watchingPayment, slug]);

  async function quoteShipping(cep: string) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8 || cart.subtotal <= 0) {
      setShipOptions([]);
      setShipId('');
      return;
    }
    setQuoting(true);
    setError('');
    try {
      const res = await api<{ options: ShipOption[] }>('/shipping/quote', {
        method: 'POST',
        storeSlug: slug,
        body: {
          zipCode: digits,
          subtotal: cart.subtotal,
          items: cart.items.map((i) => ({
            productId: i.productId,
            ...(i.variantId ? { variantId: i.variantId } : {}),
            quantity: i.quantity,
            price: i.price,
          })),
        },
      });
      setShipOptions(res.options || []);
      setShipId(res.options[0]?.id || '');
    } catch (err) {
      setShipOptions([]);
      setError(err instanceof Error ? err.message : 'Erro ao calcular frete');
    } finally {
      setQuoting(false);
    }
  }

  useEffect(() => {
    if (step >= 3 && activeZip) {
      void quoteShipping(activeZip);
    }
    // Recotar quando muda CEP, valor ou composição do carrinho (peso/qtd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    activeZip,
    cart.subtotal,
    cart.items.map((i) => `${i.productId}:${i.variantId || ''}:${i.quantity}`).join('|'),
  ]);

  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, '');
    setAddrForm((f) => ({
      ...f,
      zipCode:
        digits.length > 5
          ? `${digits.slice(0, 5)}-${digits.slice(5, 8)}`
          : digits,
    }));
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) return;
      setAddrForm((f) => ({
        ...f,
        street: data.logradouro || f.street,
        neighborhood: data.bairro || f.neighborhood,
        city: data.localidade || f.city,
        state: data.uf || f.state,
      }));
    } catch {
      /* ignore */
    }
  }

  async function saveNewAddress(): Promise<string | null> {
    if (!token) return null;
    const created = await api<CustomerAddress>('/storefront/addresses', {
      method: 'POST',
      token,
      storeSlug: slug,
      body: {
        ...addrForm,
        label: addrForm.label || undefined,
        complement: addrForm.complement || undefined,
        isDefault: addresses.length === 0,
      },
    });
    await refresh();
    setAddressId(created.id);
    setEditingNew(false);
    return created.id;
  }

  async function goToShipping() {
    setError('');
    try {
      if (editingNew) {
        if (
          !addrForm.zipCode ||
          !addrForm.street ||
          !addrForm.number ||
          !addrForm.neighborhood ||
          !addrForm.city ||
          !addrForm.state
        ) {
          setError('Preencha o endereço completo');
          return;
        }
        if (saveAddress) {
          await saveNewAddress();
        } else {
          setAddressId(null);
        }
      } else if (!selectedAddress) {
        setError('Escolha ou cadastre um endereço');
        return;
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no endereço');
    }
  }

  async function applyCoupon() {
    setError('');
    if (!couponCode.trim()) {
      setCoupon(null);
      return;
    }
    try {
      const res = await api<CouponResult>('/checkout/coupons/validate', {
        method: 'POST',
        storeSlug: slug,
        body: {
          code: couponCode.trim(),
          // Igual ao pedido: o cupom vale sobre o valor já com o combo
          subtotal: Math.max(0, cart.subtotal - descontoCombo),
          shippingCost: selectedShip?.price ?? 0,
        },
      });
      setCoupon(res);
    } catch (err) {
      setCoupon(null);
      setError(err instanceof Error ? err.message : 'Cupom inválido');
    }
  }

  async function onPay(e: FormEvent) {
    e.preventDefault();
    if (!customer) {
      setError('Entre na sua conta para finalizar a compra');
      return;
    }
    if (cart.items.length === 0) {
      setError('Sacola vazia');
      return;
    }
    if (!selectedShip) {
      setError('Escolha o frete');
      return;
    }

    let finalAddressId = addressId;
    let shippingAddress:
      | {
          zipCode: string;
          street: string;
          number: string;
          complement?: string;
          neighborhood: string;
          city: string;
          state: string;
        }
      | undefined;

    // Endereço novo não salvo na conta — manda o do formulário direto
    if (editingNew && !saveAddress) {
      shippingAddress = {
        zipCode: addrForm.zipCode.replace(/\D/g, ''),
        street: addrForm.street,
        number: addrForm.number,
        complement: addrForm.complement || undefined,
        neighborhood: addrForm.neighborhood,
        city: addrForm.city,
        state: addrForm.state.trim().toUpperCase().slice(0, 2),
      };
      finalAddressId = null;
    } else if (!finalAddressId && selectedAddress) {
      finalAddressId = selectedAddress.id;
    }

    if (!finalAddressId && !shippingAddress) {
      setError('Informe o endereço de entrega');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (store && store.paymentsEnabled === false) {
        throw new Error(
          'Os pagamentos desta loja ainda não estão disponíveis. Fale com a loja para concluir sua compra.',
        );
      }

      let orderId = pendingOrderId;
      const sessionToken = authToken;
      if (!orderId) {
        const order = await api<{ id: string }>('/checkout/orders', {
          method: 'POST',
          storeSlug: slug,
          token: token || undefined,
          body: {
            customerName: customer.name,
            customerPhone: phone || undefined,
            addressId: finalAddressId || undefined,
            shippingAddress,
            saveAddress: false,
            items: cart.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              ...(i.variantId ? { variantId: i.variantId } : {}),
            })),
            shippingMethod: selectedShip.name,
            shippingOptionId: selectedShip.id,
            couponCode: coupon?.code || undefined,
            acceptTerms: true,
            ...(customer.cpf ? { customerDocument: customer.cpf } : {}),
          },
        });
        orderId = order.id;
        setPendingOrderId(order.id);
      }

      const pay = await api<{
        mode?: 'pro' | 'personalized';
        initPoint?: string;
        sandboxInitPoint?: string;
        publicKey?: string | null;
        amount?: number;
        pixAmount?: number;
        pixDiscountPercent?: number;
        orderId?: string;
        payerEmail?: string;
        payerName?: string;
      }>(`/checkout/orders/${orderId}/pay`, {
        method: 'POST',
        storeSlug: slug,
        token: sessionToken,
      });

      if (pay.mode === 'personalized' && pay.publicKey) {
        const fromForm = shippingAddress;
        const fromSaved = selectedAddress;
        const payerAddress: BrickPayerAddress | undefined = fromForm
          ? {
              zipCode: fromForm.zipCode,
              street: fromForm.street,
              number: fromForm.number,
              complement: fromForm.complement,
              neighborhood: fromForm.neighborhood,
              city: fromForm.city,
              state: fromForm.state,
            }
          : fromSaved
            ? {
                zipCode: fromSaved.zipCode,
                street: fromSaved.street,
                number: fromSaved.number,
                complement: fromSaved.complement || undefined,
                neighborhood: fromSaved.neighborhood,
                city: fromSaved.city,
                state: fromSaved.state,
              }
            : undefined;

        setBrickSession({
          orderId,
          amount: Number(pay.amount ?? total),
          pixAmount:
            pay.pixAmount != null ? Number(pay.pixAmount) : undefined,
          pixDiscountPercent: Number(pay.pixDiscountPercent ?? 0),
          publicKey: pay.publicKey,
          payerEmail: pay.payerEmail || customer.email,
          payerName: pay.payerName || customer.name,
          payerAddress,
        });
        return;
      }

      if (pay.mode === 'pro') {
        // Produção: init_point. Teste (Public Key TEST-): sandbox se existir.
        const isMpTest = Boolean(
          pay.publicKey?.trim().toUpperCase().startsWith('TEST-'),
        );
        const url = isMpTest
          ? pay.sandboxInitPoint || pay.initPoint
          : pay.initPoint || pay.sandboxInitPoint;
        if (!url) {
          throw new Error(
            'Não foi possível abrir o pagamento agora. Tente de novo em instantes.',
          );
        }
        cart.clear();
        window.location.href = url;
        return;
      }

      throw new Error(
        'Não foi possível abrir o pagamento agora. Tente de novo em instantes.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar');
    } finally {
      setBusy(false);
    }
  }

  if (!store || authLoading) {
    return <p className="p-8 text-sm text-muted">Carregando checkout…</p>;
  }

  if (!customer) {
    return (
      <p className="p-8 text-sm text-muted">Redirecionando para o login…</p>
    );
  }

  // Sucesso fora do grid do checkout — cart.clear() não pode esconder esta tela
  if (paymentDone && brickSession) {
    return (
      <main className="min-h-screen bg-[#fafafa]">
        <PaymentStatusScreen
          mode="success"
          storeSlug={slug}
          orderId={brickSession.orderId}
          total={valorEscolhido}
          storeName={store.name}
        />
      </main>
    );
  }

  const steps = [
    { n: 1 as const, label: 'Conta' },
    { n: 2 as const, label: 'Endereço' },
    { n: 3 as const, label: 'Entrega' },
    { n: 4 as const, label: 'Pagamento' },
  ];

  return (
    <main
      className="min-h-screen bg-[#fafafa] pb-10"
      style={
        {
          '--store-primary': store.primaryColor,
          '--store-accent': store.accentColor,
          '--store-accent-hover': `color-mix(in srgb, ${store.accentColor} 86%, #000)`,
        } as React.CSSProperties
      }
    >
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={`/loja/${slug}`} className="text-sm font-medium text-muted">
            ← Voltar à loja
          </Link>
          <strong className="text-sm">{store.name}</strong>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-4">
        <ol className="mb-4 flex gap-1 overflow-x-auto text-[11px] font-medium sm:text-xs">
          {steps.map((s) => (
            <li
              key={s.n}
              className={`flex min-w-0 flex-1 items-center gap-1.5 border-b-2 pb-2 ${
                step === s.n
                  ? 'border-[var(--store-accent)] text-ink'
                  : step > s.n
                    ? 'border-ink/40 text-ink'
                    : 'border-line text-muted'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  step >= s.n
                    ? 'bg-ink text-white'
                    : 'bg-[#eee] text-muted'
                }`}
              >
                {s.n}
              </span>
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      <div className="mx-auto grid max-w-3xl gap-4 px-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="card space-y-4 !p-4">
          {error ? (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          ) : null}

          {recuperado ? (
            <p className="mb-3 border border-[#bfe3c8] bg-[#f0fbf3] px-3 py-2 text-sm text-[#166534]">
              {recuperado}
            </p>
          ) : null}
          {cart.items.length === 0 && !brickSession ? (
            <p className="text-sm text-muted">
              Sacola vazia.{' '}
              <Link href={`/loja/${slug}`} className="underline">
                Ver produtos
              </Link>
            </p>
          ) : (
            <>
              {step === 2 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h1 className="text-lg font-bold">Onde entregar?</h1>
                    <p className="truncate text-xs text-muted">{customer.email}</p>
                  </div>

                  {!editingNew ? (
                    <ul className="space-y-2">
                      {addresses.map((addr) => (
                        <label
                          key={addr.id}
                          className={`flex cursor-pointer gap-2 border px-3 py-2.5 text-sm ${
                            addressId === addr.id
                              ? 'border-ink bg-[#f7f8fa]'
                              : 'border-line'
                          }`}
                        >
                          <input
                            type="radio"
                            name="addr"
                            className="mt-1"
                            checked={addressId === addr.id}
                            onChange={() => {
                              setAddressId(addr.id);
                              setEditingNew(false);
                            }}
                          />
                          <span>
                            {addr.isDefault ? (
                              <span className="mb-0.5 block text-[11px] font-bold uppercase text-[var(--ok)]">
                                Padrão
                              </span>
                            ) : null}
                            {addr.label ? (
                              <span className="font-medium">{addr.label} · </span>
                            ) : null}
                            {addr.street}, {addr.number}
                            {addr.complement ? ` — ${addr.complement}` : ''}
                            <span className="mt-0.5 block text-xs text-muted">
                              {addr.neighborhood} · {addr.city}/{addr.state} ·{' '}
                              {addr.zipCode}
                            </span>
                          </span>
                        </label>
                      ))}
                    </ul>
                  ) : null}

                  {editingNew ? (
                    <div className="space-y-2 border border-line p-3">
                      <p className="text-sm font-bold">Novo endereço</p>
                      <div>
                        <label className="label" htmlFor="endereco-zipCode">CEP</label>
                        <input
                          id="endereco-zipCode"
                          name="zipCode"
                          className="field"
                          autoComplete="shipping postal-code"
                          inputMode="numeric"
                          value={addrForm.zipCode}
                          onChange={(e) =>
                            setAddrForm({ ...addrForm, zipCode: e.target.value })
                          }
                          onBlur={(e) => lookupCep(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="endereco-street">Rua</label>
                        <input
                          id="endereco-street"
                          name="street"
                          className="field"
                          autoComplete="shipping address-line1"
                          value={addrForm.street}
                          onChange={(e) =>
                            setAddrForm({ ...addrForm, street: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label" htmlFor="endereco-number">Número</label>
                          <input
                            id="endereco-number"
                            name="number"
                            className="field"
                            value={addrForm.number}
                            onChange={(e) =>
                              setAddrForm({ ...addrForm, number: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="endereco-complement">Complemento</label>
                          <input
                            id="endereco-complement"
                            name="complement"
                            className="field"
                            autoComplete="shipping address-line2"
                            value={addrForm.complement}
                            onChange={(e) =>
                              setAddrForm({
                                ...addrForm,
                                complement: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="endereco-neighborhood">Bairro</label>
                        <input
                          id="endereco-neighborhood"
                          name="neighborhood"
                          className="field"
                          autoComplete="shipping address-level3"
                          value={addrForm.neighborhood}
                          onChange={(e) =>
                            setAddrForm({
                              ...addrForm,
                              neighborhood: e.target.value,
                            })
                          }
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label" htmlFor="endereco-city">Cidade</label>
                          <input
                            id="endereco-city"
                            name="city"
                            className="field"
                            autoComplete="shipping address-level2"
                            value={addrForm.city}
                            onChange={(e) =>
                              setAddrForm({ ...addrForm, city: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor="endereco-state">UF</label>
                          <input
                            id="endereco-state"
                            name="state"
                            className="field"
                            autoComplete="shipping address-level1"
                            value={addrForm.state}
                            onChange={(e) =>
                              setAddrForm({
                                ...addrForm,
                                state: e.target.value.toUpperCase(),
                              })
                            }
                            maxLength={2}
                            required
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={saveAddress}
                          onChange={(e) => setSaveAddress(e.target.checked)}
                        />
                        Salvar na minha conta
                      </label>
                      {addresses.length > 0 ? (
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => setEditingNew(false)}
                        >
                          Usar endereço salvo
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost w-full"
                      onClick={() => {
                        setEditingNew(true);
                        setAddressId(null);
                        setAddrForm(emptyAddr);
                      }}
                    >
                      + Entregar em outro endereço
                    </button>
                  )}

                  <div>
                    <label className="label">WhatsApp / telefone</label>
                    <input
                      className="field"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-accent w-full"
                    onClick={() => void goToShipping()}
                  >
                    Continuar para frete
                  </button>
                </section>
              ) : null}

              {step === 3 ? (
                <section className="space-y-3">
                  <button
                    type="button"
                    className="text-xs text-muted underline"
                    onClick={() => setStep(2)}
                  >
                    ← Alterar endereço
                  </button>
                  <h1 className="text-lg font-bold">Como quer receber?</h1>
                  {selectedAddress || (!saveAddress && editingNew) ? (
                    <p className="rounded border border-line bg-[#f7f8fa] px-3 py-2 text-xs text-muted">
                      {editingNew && !saveAddress
                        ? `${addrForm.street}, ${addrForm.number} · ${addrForm.city}/${addrForm.state}`
                        : `${selectedAddress?.street}, ${selectedAddress?.number} · ${selectedAddress?.city}/${selectedAddress?.state}`}
                    </p>
                  ) : null}
                  {quoting ? (
                    <p className="text-sm text-muted">Calculando frete…</p>
                  ) : shipOptions.length > 0 ? (
                    <div className="space-y-2">
                      {shipOptions.map((opt) => (
                        <label
                          key={opt.id}
                          className={`flex cursor-pointer items-center justify-between gap-3 border px-3 py-2.5 text-sm ${
                            shipId === opt.id
                              ? 'border-ink bg-[#f7f8fa]'
                              : 'border-line'
                          }`}
                        >
                          <span className="flex min-w-0 items-start gap-2">
                            <input
                              type="radio"
                              name="ship"
                              className="mt-1"
                              checked={shipId === opt.id}
                              onChange={() => setShipId(opt.id)}
                            />
                            <span>
                              <span className="block font-medium">
                                {formatDeliveryEstimate(opt.days)}
                              </span>
                              <span className="text-xs text-muted">
                                {opt.name && !opt.name.toLowerCase().includes('grátis')
                                  ? `${opt.name} · `
                                  : ''}
                                {formatDeliveryDaysHint(opt.days)}
                              </span>
                            </span>
                          </span>
                          <strong>
                            {opt.price === 0 ? 'Grátis' : money(opt.price)}
                          </strong>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Não encontramos frete para este CEP.
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn-accent w-full"
                    disabled={!selectedShip}
                    onClick={() => setStep(4)}
                  >
                    Continuar para pagamento
                  </button>
                </section>
              ) : null}

              {step === 4 ? (
                brickSession ? (
                  awaitingConfirm && !offlinePay ? (
                    <PaymentStatusScreen
                      mode="waiting"
                      storeSlug={slug}
                      orderId={brickSession.orderId}
                      total={valorEscolhido}
                    />
                  ) : (
                  <div className="space-y-3">
                    <h1 className="text-lg font-bold">Pagamento</h1>
                    {temDescontoPix && !metodo && !offlinePay ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted">
                          Como você quer pagar?
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setMetodo('pix')}
                            className="border-2 border-[#1b7f45] bg-[#f0faf4] p-4 text-left transition hover:bg-[#e3f4ea]"
                          >
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[#1b7f45]">
                              Pix ·{' '}
                              {String(brickSession.pixDiscountPercent).replace('.', ',')}% OFF
                            </span>
                            <strong className="mt-1 block text-xl text-ink">
                              {money(brickSession.pixAmount ?? brickSession.amount)}
                            </strong>
                            <span className="text-xs text-muted">
                              Aprovação na hora · economize{' '}
                              {money(
                                brickSession.amount -
                                  (brickSession.pixAmount ?? brickSession.amount),
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMetodo('cartao')}
                            className="border-2 border-line bg-white p-4 text-left transition hover:border-ink"
                          >
                            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                              Cartão
                            </span>
                            <strong className="mt-1 block text-xl text-ink">
                              {money(brickSession.amount)}
                            </strong>
                            <span className="text-xs text-muted">
                              Crédito em até 12x ou débito
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>
                          Total {money(valorEscolhido)} ·{' '}
                          {metodo === 'pix'
                            ? 'Pix'
                            : metodo === 'cartao'
                              ? 'cartão'
                              : 'cartão ou Pix'}
                        </span>
                        {temDescontoPix && metodo && !offlinePay ? (
                          <button
                            type="button"
                            className="font-semibold text-ink underline underline-offset-2"
                            onClick={() => setMetodo(null)}
                          >
                            Trocar
                          </button>
                        ) : null}
                      </p>
                    )}

                    {offlinePay ? (
                      <OfflinePaymentPanel
                        info={offlinePay}
                        amount={valorEscolhido}
                      />
                    ) : null}

                    {!offlinePay && !(temDescontoPix && !metodo) ? (
                    <MpPaymentBrick
                      key={metodo || 'todos'}
                      metodo={temDescontoPix ? (metodo ?? undefined) : undefined}
                      publicKey={brickSession.publicKey}
                      amount={valorEscolhido}
                      payerEmail={brickSession.payerEmail}
                      payerName={brickSession.payerName}
                      payerAddress={brickSession.payerAddress}
                      onError={(msg) => setError(msg)}
                      onSubmit={async (formData) => {
                        setBusy(true);
                        setError('');
                        try {
                          const result = await api<{
                            id?: number;
                            paymentId?: number;
                            approved?: boolean;
                            status?: string;
                            status_detail?: string;
                            orderId: string;
                            qrCode?: string | null;
                            qrCodeBase64?: string | null;
                            ticketUrl?: string | null;
                            digitableLine?: string | null;
                            barcode?: string | null;
                          }>(
                            `/checkout/orders/${brickSession.orderId}/pay-brick`,
                            {
                              method: 'POST',
                              storeSlug: slug,
                              token: authToken,
                              body: { formData },
                            },
                          );

                          const paymentId = result.id ?? result.paymentId;
                          const status = result.status || '';

                          if (result.approved || status === 'approved') {
                            // Marca sucesso ANTES de limpar a sacola (senão a UI vira "Sacola vazia")
                            setOfflinePay(null);
                            setAwaitingConfirm(false);
                            setWatchingPayment(false);
                            setPaymentDone(true);
                            setBusy(false);
                            cart.clear();
                          } else if (
                            status === 'pending' ||
                            status === 'in_process'
                          ) {
                            // Pix/boleto: UI própria com QR; poll confirma depois
                            setOfflinePay({
                              paymentId,
                              status,
                              qrCode: result.qrCode,
                              qrCodeBase64: result.qrCodeBase64,
                              ticketUrl: result.ticketUrl,
                              digitableLine: result.digitableLine,
                              barcode: result.barcode,
                            });
                            setWatchingPayment(true);
                            setBusy(false);
                          } else if (status === 'rejected') {
                            setBusy(false);
                            setError(
                              result.status_detail ||
                                'Pagamento recusado. Tente outro meio.',
                            );
                          } else {
                            setBusy(false);
                          }

                          return {
                            id: paymentId,
                            status,
                            status_detail: result.status_detail,
                          };
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Pagamento recusado',
                          );
                          setBusy(false);
                          throw err;
                        }
                      }}
                    />
                    ) : null}
                    {busy ? (
                      <p className="text-xs text-muted">
                        Enviando pagamento ao Mercado Pago…
                      </p>
                    ) : null}
                    {watchingPayment || offlinePay ? (
                      <button
                        type="button"
                        className="text-xs text-muted underline"
                        onClick={() => {
                          setWatchingPayment(true);
                          setAwaitingConfirm(true);
                        }}
                      >
                        Já paguei — confirmar pagamento →
                      </button>
                    ) : null}
                  </div>
                  )
                ) : (
                <form onSubmit={onPay} className="space-y-3">
                  <button
                    type="button"
                    className="text-xs text-muted underline"
                    onClick={() => setStep(3)}
                  >
                    ← Alterar frete
                  </button>
                  <h1 className="text-lg font-bold">Pagamento</h1>
                  <div>
                    <label className="label" htmlFor="cupom">
                      Cupom (opcional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="cupom"
                        name="cupom"
                        className="field"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Ex.: BEMVINDO10"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0"
                        onClick={applyCoupon}
                      >
                        Aplicar
                      </button>
                    </div>
                    {coupon ? (
                      <p className="mt-1 text-xs text-[var(--ok)]">
                        {coupon.freeShipping
                          ? `Cupom ${coupon.code}: frete grátis`
                          : `Cupom ${coupon.code}: −${money(coupon.discount)}`}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">
                    {(store.checkoutMode || 'personalized') !== 'pro'
                      ? 'Cartão e Pix na própria loja.'
                      : 'Você será redirecionado ao Mercado Pago (Checkout Pro) para pagar com segurança.'}
                  </p>
                  {store.paymentsEnabled === false ? (
                    <p className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                      Os pagamentos desta loja ainda não estão disponíveis. Fale com
                      a loja para concluir sua compra.
                    </p>
                  ) : null}
                  {/*
                    Decreto 7.962/2013 art. 4º, I: o sumário do contrato tem
                    que ser apresentado antes da contratação. Os links abrem em
                    aba nova de propósito — sair do checkout para ler a política
                    e perder o carrinho seria pior para todo mundo.
                  */}
                  <div className="border border-line bg-[#fafafa] p-3">
                    <ul className="space-y-1 text-[12px] leading-relaxed text-muted">
                      {selectedShip ? (
                        <li>
                          Entrega por {selectedShip.name}, prazo de{' '}
                          {formatDeliveryEstimate(selectedShip.days)} após a
                          aprovação do pagamento.
                        </li>
                      ) : null}
                      <li>
                        Você pode desistir da compra em até 7 dias corridos do
                        recebimento e receber o valor de volta.
                      </li>
                      <li>
                        Produtos com defeito têm garantia legal de 30 ou 90
                        dias, conforme o tipo.
                      </li>
                    </ul>
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-[13px] leading-snug">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={aceitou}
                        onChange={(e) => setAceitou(e.target.checked)}
                      />
                      <span>
                        Li e concordo com as{' '}
                        <Link
                          href={`/loja/${slug}/politicas/termos`}
                          target="_blank"
                          className="font-semibold underline"
                        >
                          condições de venda
                        </Link>
                        , a{' '}
                        <Link
                          href={`/loja/${slug}/politicas/trocas`}
                          target="_blank"
                          className="font-semibold underline"
                        >
                          política de trocas
                        </Link>{' '}
                        e a{' '}
                        <Link
                          href={`/loja/${slug}/politicas/privacidade`}
                          target="_blank"
                          className="font-semibold underline"
                        >
                          política de privacidade
                        </Link>
                        .
                      </span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-accent w-full"
                    disabled={busy || !aceitou || store.paymentsEnabled === false}
                  >
                    {busy ? 'Abrindo Mercado Pago…' : `Pagar ${money(total)}`}
                  </button>
                </form>
                )
              ) : null}
            </>
          )}
        </div>

        <aside className="card h-fit !p-4">
          <h2 className="mb-3 text-sm font-bold">Resumo</h2>
          <ul className="mb-3 space-y-2">
            {cart.items.map((item) => {
              const img = thumbUrl(item.image);
              return (
                <li key={item.productId} className="flex gap-2 text-sm">
                  <div className="h-14 w-11 shrink-0 overflow-hidden bg-[#eee]">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={img} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <SemFoto nome={item.name} variante="mini" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted">
                      {item.quantity} × {money(item.price)}
                    </p>
                  </div>
                  <strong className="shrink-0">
                    {money(item.price * item.quantity)}
                  </strong>
                </li>
              );
            })}
          </ul>
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span>{money(cart.subtotal)}</span>
            </div>
            {descontoCombo > 0 ? (
              <div className="flex justify-between text-[var(--ok)]">
                <span>Compre junto</span>
                <span>−{money(descontoCombo)}</span>
              </div>
            ) : null}
            {discount > 0 ? (
              <div className="flex justify-between text-[var(--ok)]">
                <span>Desconto</span>
                <span>−{money(discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span className="text-muted">Frete</span>
              <span
                className={
                  coupon?.freeShipping ? 'font-semibold text-[var(--ok)]' : ''
                }
              >
                {coupon?.freeShipping
                  ? 'Grátis (cupom)'
                  : selectedShip
                    ? selectedShip.price === 0
                      ? 'Grátis'
                      : money(selectedShip.price)
                    : '—'}
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
