import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/*
 * Direitos do titular dos dados (LGPD art. 18).
 *
 * - Portabilidade e acesso (incisos II e V): exportação do que a loja guarda
 *   sobre a pessoa, em JSON legível.
 * - Exclusão (inciso VI): anonimização, não apagamento.
 *
 * Por que anonimizar em vez de apagar: o art. 16, I autoriza — e a
 * legislação fiscal obriga — manter o registro das operações. Apagar o
 * pedido destruiria a contabilidade da loja e a nota fiscal já emitida. O
 * caminho correto é remover o que identifica a pessoa e preservar o
 * histórico financeiro sem dono.
 */

/** Marcador visível: quem abrir o pedido entende que foi um pedido de exclusão. */
const REMOVIDO = '[dados removidos]';

@Injectable()
export class PersonalDataService {
  private readonly logger = new Logger(PersonalDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Tudo que a loja guarda sobre este cliente, em formato legível. */
  async export(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId },
      include: {
        addresses: true,
        orders: {
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        },
        reviews: { select: { id: true, rating: true, comment: true, createdAt: true } },
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true, sellerLegalName: true },
    });

    return {
      geradoEm: new Date().toISOString(),
      loja: store.sellerLegalName || store.name,
      titular: {
        nome: customer.name,
        email: customer.email,
        telefone: customer.phone,
        cpf: customer.cpf,
        clienteDesde: customer.createdAt,
      },
      enderecos: customer.addresses.map((a) => ({
        apelido: a.label,
        cep: a.zipCode,
        logradouro: a.street,
        numero: a.number,
        complemento: a.complement,
        bairro: a.neighborhood,
        cidade: a.city,
        uf: a.state,
        principal: a.isDefault,
      })),
      pedidos: customer.orders.map((o) => ({
        numero: o.orderNumber,
        data: o.createdAt,
        situacao: o.status,
        pagamento: o.paymentStatus,
        subtotal: o.subtotal,
        frete: o.shippingCost,
        desconto: o.discount,
        total: o.total,
        entrega: o.shippingAddress,
        itens: o.items.map((i) => ({
          produto: i.productName,
          variacao: i.variantLabel,
          quantidade: i.quantity,
          valorUnitario: i.unitPrice,
          total: i.total,
        })),
      })),
      avaliacoes: customer.reviews,
      observacao:
        'Dados de pedidos e notas fiscais são mantidos pelo prazo exigido pela legislação fiscal, mesmo após pedido de exclusão (LGPD art. 16, I).',
    };
  }

  /**
   * Remove o que identifica a pessoa e preserva o histórico financeiro.
   *
   * Também derruba as sessões abertas: sem subir o tokenVersion, um token já
   * emitido continuaria valendo depois da exclusão.
   */
  async anonymize(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId },
      select: { id: true, email: true, name: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    if (customer.email.endsWith('@removido.local')) {
      throw new BadRequestException('Estes dados já foram removidos');
    }

    // e-mail precisa continuar único dentro da loja
    const emailAnonimo = `removido-${customer.id}@removido.local`;

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          name: REMOVIDO,
          email: emailAnonimo,
          phone: null,
          cpf: null,
          // sem hash de senha não há login possível
          passwordHash: null,
          tokenVersion: { increment: 1 },
        },
      });

      // Endereço é dado pessoal e não tem valor fiscal próprio: sai inteiro.
      await tx.address.deleteMany({ where: { customerId: customer.id } });

      /*
       * O pedido guarda uma cópia dos dados do comprador no momento da
       * compra. Some o que identifica; ficam número, itens e valores, que é
       * o que a contabilidade e a nota fiscal exigem.
       */
      await tx.order.updateMany({
        where: { customerId: customer.id, storeId },
        data: {
          customerName: REMOVIDO,
          customerEmail: emailAnonimo,
          customerPhone: null,
          customerDocument: null,
          shippingAddress: {},
        },
      });

      // Avaliação não guarda nome: puxa do cliente, então já saiu junto.
    });

    this.logger.log(
      `Dados pessoais anonimizados (customer=${customer.id}, store=${storeId})`,
    );
    return { ok: true, anonimizadoEm: new Date().toISOString() };
  }
}
