import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  DiscountType,
  OrderStatus,
  PaymentStatus,
  PrismaClient,
  Role,
  StoreStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const STORE_SLUG = process.env.SEED_STORE_SLUG || 'rauanimports';
const CUSTOMER_COUNT = Number(process.env.SEED_CUSTOMERS || 120);
const PRODUCT_COUNT = Number(process.env.SEED_PRODUCTS || 150);
const ORDER_COUNT = Number(process.env.SEED_ORDERS || 280);
const DEMO_CUSTOMER_EMAIL = 'cliente@demo.com';
const DEMO_CUSTOMER_PASSWORD = 'cliente123';
const STORE_ADMIN_EMAIL = process.env.SEED_STORE_ADMIN_EMAIL || 'admin@rauanimports.com';
const STORE_ADMIN_PASSWORD = process.env.SEED_STORE_ADMIN_PASSWORD || 'admin123';

const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fábio', 'Gabriela', 'Hugo',
  'Isabela', 'João', 'Karen', 'Lucas', 'Marina', 'Nicolas', 'Olívia', 'Pedro',
  'Queila', 'Rafael', 'Sofia', 'Thiago', 'Úrsula', 'Vinícius', 'Wendy', 'Yasmin',
  'André', 'Beatriz', 'Caio', 'Daniela', 'Eduardo', 'Fernanda', 'Gustavo', 'Helena',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
  'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
  'Rocha', 'Almeida', 'Nascimento', 'Araújo', 'Melo', 'Barbosa',
];

const CITIES = [
  { city: 'São Paulo', state: 'SP', zips: ['01001-000', '01310-100', '04038-001'] },
  { city: 'Rio de Janeiro', state: 'RJ', zips: ['20040-020', '22041-080', '22640-100'] },
  { city: 'Belo Horizonte', state: 'MG', zips: ['30130-000', '30140-071', '30310-190'] },
  { city: 'Curitiba', state: 'PR', zips: ['80010-000', '80250-030', '80420-090'] },
  { city: 'Porto Alegre', state: 'RS', zips: ['90010-150', '90430-001', '90620-110'] },
  { city: 'Salvador', state: 'BA', zips: ['40020-000', '40140-110', '41820-020'] },
  { city: 'Brasília', state: 'DF', zips: ['70040-010', '70200-030', '70390-050'] },
  { city: 'Fortaleza', state: 'CE', zips: ['60025-000', '60165-121', '60810-140'] },
];

const STREETS = [
  'Rua das Flores', 'Av. Paulista', 'Rua Augusta', 'Rua XV de Novembro',
  'Av. Brasil', 'Rua do Comércio', 'Rua das Palmeiras', 'Av. Atlântica',
  'Rua Amazonas', 'Rua Bahia', 'Av. Independência', 'Rua São João',
];

const CATEGORIES = [
  { name: 'Eletrônicos', slug: 'eletronicos' },
  { name: 'Celulares', slug: 'celulares' },
  { name: 'Acessórios', slug: 'acessorios' },
  { name: 'Moda Feminina', slug: 'moda-feminina' },
  { name: 'Moda Masculina', slug: 'moda-masculina' },
  { name: 'Calçados', slug: 'calcados' },
  { name: 'Beleza', slug: 'beleza' },
  { name: 'Casa', slug: 'casa' },
  { name: 'Esportes', slug: 'esportes' },
  { name: 'Infantil', slug: 'infantil' },
  { name: 'Relógios', slug: 'relogios' },
  { name: 'Importados', slug: 'importados' },
];

const PRODUCT_PREFIXES = [
  'Fone Bluetooth', 'Carregador Turbo', 'Capa Premium', 'Smartwatch',
  'Caixa de Som', 'Mouse Gamer', 'Teclado Mecânico', 'Webcam Full HD',
  'Power Bank', 'Cabo USB-C', 'Suporte Veicular', 'Ring Light',
  'Perfume Importado', 'Mochila Executiva', 'Tênis Running', 'Óculos UV',
  'Bolsa Crossbody', 'Camiseta Oversized', 'Jaqueta Corta-Vento', 'Boné Snapback',
  'Kit Skincare', 'Difusor Aroma', 'Luminária LED', 'Organizador Mesa',
  'Garrafa Térmica', 'Squeeze Academia', 'Faixa Elástica', 'Colchonete Yoga',
];

const BRANDS = [
  'NovaTech', 'PrimeBox', 'UrbanFit', 'GlowLab', 'Aether', 'VoltMax',
  'CasaNest', 'StyleHub', 'SportPeak', 'Lumina',
];

const ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function productImageUrl(index: number, variant = 0) {
  return `https://picsum.photos/seed/rauan-${index}-${variant}/600/600`;
}

function phoneFor(i: number) {
  const ddd = pick([11, 21, 31, 41, 51, 61, 71, 85], i);
  const rest = String(900000000 + (i % 89999999)).padStart(9, '0');
  return `(${ddd}) 9${rest.slice(1, 5)}-${rest.slice(5)}`;
}

function cpfFor(i: number) {
  const base = String(10000000000 + i).padStart(11, '0').slice(0, 11);
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-${base.slice(9)}`;
}

async function ensureSuperAdmin() {
  const email = (
    process.env.SUPER_ADMIN_EMAIL || 'admin@plataforma.com'
  ).toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'admin123';
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findFirst({
    where: { email, role: Role.SUPER_ADMIN },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, name, active: true },
    });
    console.log(`Super admin atualizado: ${email}`);
  } else {
    await prisma.user.create({
      data: { email, passwordHash, name, role: Role.SUPER_ADMIN },
    });
    console.log(`Super admin criado: ${email}`);
  }
}

async function ensureStore() {
  const store = await prisma.store.upsert({
    where: { slug: STORE_SLUG },
    update: {
      name: 'Rauan Imports',
      status: StoreStatus.ACTIVE,
      planName: 'pro',
      monthlyFee: 149,
      planDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      primaryColor: '#111111',
      accentColor: '#e11d48',
      freteModo: 'manual',
      freteValorFixo: 19.9,
      freteGratisAcima: 199,
      marqueeEnabled: true,
      marqueeImages: [
        productImageUrl(9001),
        productImageUrl(9002),
        productImageUrl(9003),
      ],
    },
    create: {
      name: 'Rauan Imports',
      slug: STORE_SLUG,
      status: StoreStatus.ACTIVE,
      planName: 'pro',
      monthlyFee: 149,
      planDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      primaryColor: '#111111',
      accentColor: '#e11d48',
      freteModo: 'manual',
      freteValorFixo: 19.9,
      freteGratisAcima: 199,
      marqueeEnabled: true,
      marqueeImages: [
        productImageUrl(9001),
        productImageUrl(9002),
        productImageUrl(9003),
      ],
    },
  });

  const adminHash = await bcrypt.hash(STORE_ADMIN_PASSWORD, 10);
  const adminEmail = STORE_ADMIN_EMAIL.toLowerCase();
  const existingAdmin = await prisma.user.findFirst({
    where: { storeId: store.id, email: adminEmail },
  });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        passwordHash: adminHash,
        name: 'Admin Rauan',
        role: Role.STORE_ADMIN,
        active: true,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: adminHash,
        name: 'Admin Rauan',
        role: Role.STORE_ADMIN,
        storeId: store.id,
      },
    });
  }

  console.log(`Loja pronta: ${store.slug} (${store.id})`);
  return store;
}

async function wipeStoreCatalog(storeId: string) {
  console.log('Limpando dados anteriores da loja (pedidos, produtos, clientes)...');
  await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
  await prisma.order.deleteMany({ where: { storeId } });
  await prisma.promotion.deleteMany({ where: { storeId } });
  await prisma.coupon.deleteMany({ where: { storeId } });
  await prisma.productImage.deleteMany({ where: { product: { storeId } } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.address.deleteMany({ where: { customer: { storeId } } });
  await prisma.customer.deleteMany({ where: { storeId } });
  await prisma.category.deleteMany({ where: { storeId } });
}

async function seedCategories(storeId: string) {
  const created = [];
  for (const cat of CATEGORIES) {
    const row = await prisma.category.create({
      data: {
        storeId,
        name: cat.name,
        slug: cat.slug,
        description: `Categoria ${cat.name} da Rauan Imports`,
        active: true,
      },
    });
    created.push(row);
  }
  console.log(`Categorias: ${created.length}`);
  return created;
}

async function seedProducts(
  storeId: string,
  categories: { id: string }[],
) {
  const productsData = Array.from({ length: PRODUCT_COUNT }, (_, i) => {
    const name = `${pick(PRODUCT_PREFIXES, i)} ${pick(BRANDS, i + 3)} ${i + 1}`;
    const price = money(29.9 + (i % 40) * 12.5 + (i % 7) * 3.1);
    const onSale = i % 4 === 0;
    return {
      storeId,
      categoryId: pick(categories, i).id,
      name,
      slug: `${slugify(name)}-${i + 1}`,
      description: `${name}. Produto importado com garantia e envio rápido. Ideal para o dia a dia.`,
      sku: `SEED-${String(i + 1).padStart(4, '0')}`,
      brand: pick(BRANDS, i),
      price,
      compareAt: onSale ? money(price * 1.35) : null,
      installments: i % 3 === 0 ? pick([3, 6, 10, 12], i) : null,
      weightKg: money(0.3 + (i % 10) * 0.15),
      widthCm: 12 + (i % 8) * 2,
      heightCm: 8 + (i % 6),
      lengthCm: 16 + (i % 10),
      stock: 5 + (i % 80),
      active: i % 17 !== 0,
      featured: i % 11 === 0,
      attributes: {
        cor: pick(['Preto', 'Branco', 'Azul', 'Vermelho', 'Cinza'], i),
        origem: 'Importado',
      },
    };
  });

  await prisma.product.createMany({ data: productsData });
  const products = await prisma.product.findMany({
    where: { storeId },
    orderBy: { sku: 'asc' },
  });

  const images = products.flatMap((p, i) => [
    {
      productId: p.id,
      url: productImageUrl(i + 1, 0),
      alt: p.name,
      position: 0,
    },
    ...(i % 3 === 0
      ? [
          {
            productId: p.id,
            url: productImageUrl(i + 1, 1),
            alt: `${p.name} ângulo 2`,
            position: 1,
          },
        ]
      : []),
  ]);

  for (let i = 0; i < images.length; i += 500) {
    await prisma.productImage.createMany({ data: images.slice(i, i + 500) });
  }

  console.log(`Produtos: ${products.length} (+ ${images.length} imagens)`);
  return products;
}

async function seedCoupons(storeId: string) {
  const now = new Date();
  const coupons = [
    {
      code: 'BEMVINDO10',
      description: '10% na primeira compra',
      type: DiscountType.PERCENT,
      value: 10,
      minSubtotal: 50,
      maxUses: 500,
      usedCount: 42,
    },
    {
      code: 'RAUAN20',
      description: 'R$ 20 de desconto',
      type: DiscountType.FIXED,
      value: 20,
      minSubtotal: 120,
      maxUses: 200,
      usedCount: 18,
    },
    {
      code: 'FRETEGRATIS',
      description: 'Frete grátis',
      type: DiscountType.FREE_SHIPPING,
      value: 0,
      minSubtotal: 99,
      maxUses: null,
      usedCount: 67,
    },
    {
      code: 'VIP15',
      description: '15% clientes VIP',
      type: DiscountType.PERCENT,
      value: 15,
      minSubtotal: 80,
      maxUses: 100,
      usedCount: 9,
    },
    {
      code: 'MEGA50',
      description: 'R$ 50 off',
      type: DiscountType.FIXED,
      value: 50,
      minSubtotal: 300,
      maxUses: 50,
      usedCount: 12,
    },
    {
      code: 'FLASH5',
      description: '5% flash',
      type: DiscountType.PERCENT,
      value: 5,
      minSubtotal: null,
      maxUses: 1000,
      usedCount: 210,
    },
  ];

  await prisma.coupon.createMany({
    data: coupons.map((c) => ({
      storeId,
      ...c,
      active: true,
      startsAt: new Date(now.getTime() - 30 * 86400000),
      endsAt: new Date(now.getTime() + 90 * 86400000),
    })),
  });

  const rows = await prisma.coupon.findMany({ where: { storeId } });
  console.log(`Cupons: ${rows.length}`);
  return rows;
}

async function seedPromotions(storeId: string, products: { id: string; name: string }[]) {
  const featured = products.filter((_, i) => i % 7 === 0).slice(0, 25);
  await prisma.promotion.createMany({
    data: featured.map((p, i) => ({
      storeId,
      productId: p.id,
      title: `Oferta ${i + 1}: ${p.name.slice(0, 40)}`,
      active: i % 5 !== 0,
      startsAt: new Date(Date.now() - 7 * 86400000),
      endsAt: new Date(Date.now() + 30 * 86400000),
    })),
  });
  console.log(`Promoções: ${featured.length}`);
}

async function seedCustomers(storeId: string) {
  const passwordHash = await bcrypt.hash(DEMO_CUSTOMER_PASSWORD, 10);
  const customersData = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i * 3);
    const isDemo = i === 0;
    return {
      storeId,
      email: isDemo
        ? DEMO_CUSTOMER_EMAIL
        : `cliente${String(i + 1).padStart(3, '0')}@seed.local`,
      passwordHash,
      name: isDemo ? 'Cliente Demo' : `${first} ${last}`,
      phone: phoneFor(i + 10),
      cpf: cpfFor(i + 100),
    };
  });

  await prisma.customer.createMany({ data: customersData });
  const customers = await prisma.customer.findMany({
    where: { storeId },
    orderBy: { email: 'asc' },
  });

  const addresses = customers.flatMap((c, i) => {
    const place = pick(CITIES, i);
    const zip = pick(place.zips, i);
    const base = {
      customerId: c.id,
      street: pick(STREETS, i),
      number: String(10 + (i % 900)),
      neighborhood: pick(['Centro', 'Jardins', 'Boa Vista', 'Vila Nova', 'Industrial'], i),
      city: place.city,
      state: place.state,
      zipCode: zip,
    };
    const list = [
      { ...base, label: 'Casa', isDefault: true, complement: i % 4 === 0 ? 'Apto 12' : null },
    ];
    if (i % 3 === 0) {
      list.push({
        ...base,
        street: pick(STREETS, i + 5),
        number: String(50 + (i % 400)),
        label: 'Trabalho',
        isDefault: false,
        complement: null,
        zipCode: pick(place.zips, i + 1),
      });
    }
    return list;
  });

  for (let i = 0; i < addresses.length; i += 400) {
    await prisma.address.createMany({ data: addresses.slice(i, i + 400) });
  }

  console.log(`Clientes: ${customers.length} (+ ${addresses.length} endereços)`);
  return customers;
}

function statusBundle(i: number): {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  refundStatus: string | null;
  refundReason: string | null;
  refundRequestedAt: Date | null;
  refundedAt: Date | null;
  trackingCode: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
} {
  const status = pick(ORDER_STATUSES, i);
  const createdOffset = (i % 90) * 86400000 + (i % 24) * 3600000;
  const createdAt = new Date(Date.now() - createdOffset);

  if (status === OrderStatus.PENDING) {
    return {
      status,
      paymentStatus: PaymentStatus.PENDING,
      refundStatus: null,
      refundReason: null,
      refundRequestedAt: null,
      refundedAt: null,
      trackingCode: null,
      paidAt: null,
      shippedAt: null,
    };
  }
  if (status === OrderStatus.CANCELLED) {
    return {
      status,
      paymentStatus: pick(
        [PaymentStatus.CANCELLED, PaymentStatus.REJECTED, PaymentStatus.PENDING],
        i,
      ),
      refundStatus: null,
      refundReason: null,
      refundRequestedAt: null,
      refundedAt: null,
      trackingCode: null,
      paidAt: null,
      shippedAt: null,
    };
  }
  if (status === OrderStatus.REFUNDED) {
    return {
      status,
      paymentStatus: PaymentStatus.REFUNDED,
      refundStatus: 'APPROVED',
      refundReason: 'Cliente solicitou estorno',
      refundRequestedAt: new Date(createdAt.getTime() + 2 * 86400000),
      refundedAt: new Date(createdAt.getTime() + 4 * 86400000),
      trackingCode: null,
      paidAt: new Date(createdAt.getTime() + 3600000),
      shippedAt: null,
    };
  }

  const paidAt = new Date(createdAt.getTime() + 30 * 60000);
  const shippedAt =
    status === OrderStatus.SHIPPED || status === OrderStatus.DELIVERED
      ? new Date(paidAt.getTime() + 2 * 86400000)
      : null;

  let refundStatus: string | null = null;
  let refundReason: string | null = null;
  let refundRequestedAt: Date | null = null;
  if (status === OrderStatus.DELIVERED && i % 18 === 0) {
    refundStatus = 'REQUESTED';
    refundReason = 'Produto veio com defeito';
    refundRequestedAt = new Date(Date.now() - (i % 5) * 86400000);
  } else if (status === OrderStatus.DELIVERED && i % 23 === 0) {
    refundStatus = 'REJECTED';
    refundReason = 'Fora do prazo de devolução';
    refundRequestedAt = new Date(Date.now() - 10 * 86400000);
  }

  return {
    status,
    paymentStatus: PaymentStatus.APPROVED,
    refundStatus,
    refundReason,
    refundRequestedAt,
    refundedAt: null,
    trackingCode: shippedAt ? `BR${String(100000000 + i)}` : null,
    paidAt,
    shippedAt,
  };
}

async function seedOrders(
  storeId: string,
  customers: { id: string; name: string; email: string; phone: string | null }[],
  products: {
    id: string;
    name: string;
    sku: string | null;
    price: { toNumber?: () => number } | number | string;
  }[],
  coupons: { id: string; code: string; type: DiscountType; value: { toNumber?: () => number } | number }[],
) {
  const demoCustomer = customers.find((c) => c.email === DEMO_CUSTOMER_EMAIL)!;
  const activeProducts = products.filter((_, i) => i % 17 !== 0);
  const ordersPayload: {
    storeId: string;
    customerId: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    subtotal: number;
    shippingCost: number;
    discount: number;
    total: number;
    shippingMethod: string | null;
    trackingCode: string | null;
    customerName: string;
    customerEmail: string;
    customerPhone: string | null;
    shippingAddress: object;
    couponId: string | null;
    couponCode: string | null;
    notes: string | null;
    paidAt: Date | null;
    shippedAt: Date | null;
    refundRequestedAt: Date | null;
    refundReason: string | null;
    refundStatus: string | null;
    refundedAt: Date | null;
    createdAt: Date;
  }[] = [];

  const itemsByOrderNumber = new Map<
    string,
    {
      productId: string;
      productName: string;
      sku: string | null;
      unitPrice: number;
      quantity: number;
      total: number;
    }[]
  >();

  for (let i = 0; i < ORDER_COUNT; i++) {
    const customer =
      i < 45 ? demoCustomer : pick(customers, i + 11);
    const itemCount = 1 + (i % 4);
    const lineItems = [];
    let subtotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const product = pick(activeProducts, i * 3 + j);
      const unit =
        typeof product.price === 'object' && product.price && 'toNumber' in product.price
          ? product.price.toNumber!()
          : Number(product.price);
      const quantity = 1 + ((i + j) % 3);
      const total = money(unit * quantity);
      subtotal = money(subtotal + total);
      lineItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPrice: money(unit),
        quantity,
        total,
      });
    }

    const place = pick(CITIES, i);
    const bundle = statusBundle(i);
    const useCoupon = i % 5 === 0 && coupons.length > 0;
    const coupon = useCoupon ? pick(coupons, i) : null;
    let discount = 0;
    if (coupon) {
      const value =
        typeof coupon.value === 'object' && coupon.value && 'toNumber' in coupon.value
          ? coupon.value.toNumber!()
          : Number(coupon.value);
      if (coupon.type === DiscountType.PERCENT) {
        discount = money((subtotal * value) / 100);
      } else if (coupon.type === DiscountType.FIXED) {
        discount = money(Math.min(value, subtotal));
      }
    }

    const freeShipping =
      coupon?.type === DiscountType.FREE_SHIPPING || subtotal >= 199;
    const shippingCost =
      freeShipping || bundle.status === OrderStatus.CANCELLED
        ? 0
        : money(12.9 + (i % 5) * 3.5);

    const total = money(Math.max(0, subtotal - discount + shippingCost));
    const createdOffset = (i % 90) * 86400000 + (i % 24) * 3600000;
    const orderNumber = String(i + 1).padStart(6, '0');

    ordersPayload.push({
      storeId,
      customerId: customer.id,
      orderNumber,
      status: bundle.status,
      paymentStatus: bundle.paymentStatus,
      subtotal,
      shippingCost,
      discount,
      total,
      shippingMethod: freeShipping ? 'Frete grátis' : 'Entrega padrão',
      trackingCode: bundle.trackingCode,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      shippingAddress: {
        street: pick(STREETS, i),
        number: String(10 + (i % 900)),
        neighborhood: 'Centro',
        city: place.city,
        state: place.state,
        zipCode: pick(place.zips, i),
      },
      couponId: coupon?.id ?? null,
      couponCode: coupon?.code ?? null,
      notes: i % 12 === 0 ? 'Entregar no período da tarde' : null,
      paidAt: bundle.paidAt,
      shippedAt: bundle.shippedAt,
      refundRequestedAt: bundle.refundRequestedAt,
      refundReason: bundle.refundReason,
      refundStatus: bundle.refundStatus,
      refundedAt: bundle.refundedAt,
      createdAt: new Date(Date.now() - createdOffset),
    });

    itemsByOrderNumber.set(orderNumber, lineItems);
  }

  for (let i = 0; i < ordersPayload.length; i += 100) {
    await prisma.order.createMany({ data: ordersPayload.slice(i, i + 100) });
  }

  const createdOrders = await prisma.order.findMany({
    where: { storeId },
    select: { id: true, orderNumber: true },
  });

  const allItems = createdOrders.flatMap((order) => {
    const lines = itemsByOrderNumber.get(order.orderNumber) || [];
    return lines.map((line) => ({
      orderId: order.id,
      ...line,
    }));
  });

  for (let i = 0; i < allItems.length; i += 500) {
    await prisma.orderItem.createMany({ data: allItems.slice(i, i + 500) });
  }

  const demoOrders = await prisma.order.count({
    where: { storeId, customerId: demoCustomer.id },
  });

  console.log(`Pedidos: ${createdOrders.length} (+ ${allItems.length} itens)`);
  console.log(`Pedidos do cliente demo: ${demoOrders}`);
}

async function main() {
  console.log('=== Seed pesado da loja ===');
  console.log({
    STORE_SLUG,
    PRODUCT_COUNT,
    CUSTOMER_COUNT,
    ORDER_COUNT,
  });

  await ensureSuperAdmin();
  const store = await ensureStore();
  await wipeStoreCatalog(store.id);

  const categories = await seedCategories(store.id);
  const products = await seedProducts(store.id, categories);
  const coupons = await seedCoupons(store.id);
  await seedPromotions(store.id, products);
  const customers = await seedCustomers(store.id);
  await seedOrders(store.id, customers, products, coupons);

  console.log('\n=== Pronto ===');
  console.log(`Vitrine: /loja/${STORE_SLUG}`);
  console.log(`Admin loja: ${STORE_ADMIN_EMAIL} / ${STORE_ADMIN_PASSWORD}`);
  console.log(`Cliente demo (muitos pedidos): ${DEMO_CUSTOMER_EMAIL} / ${DEMO_CUSTOMER_PASSWORD}`);
  console.log(`Pedidos do cliente: /loja/${STORE_SLUG}/conta/pedidos`);
  console.log(`Super admin: ${process.env.SUPER_ADMIN_EMAIL || 'admin@plataforma.com'} / ${process.env.SUPER_ADMIN_PASSWORD || 'admin123'}`);
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
