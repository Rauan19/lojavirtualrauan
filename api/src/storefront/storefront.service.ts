import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddressDto,
  CustomerLoginDto,
  CustomerRegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/storefront.dto';
import { MailService } from '../mail/mail.service';
import { buildPasswordResetEmail } from '../mail/password-reset-email';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private async tokenFor(customer: {
    id: string;
    email: string;
    storeId: string;
    name: string;
    phone: string | null;
    tokenVersion: number;
  }) {
    const accessToken = await this.jwt.signAsync(
      {
        sub: customer.id,
        email: customer.email,
        role: Role.CUSTOMER,
        storeId: customer.storeId,
        typ: 'customer',
        tv: customer.tokenVersion,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ||
          '7d') as `${number}d`,
      },
    );

    return {
      accessToken,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        storeId: customer.storeId,
      },
    };
  }

  async register(storeId: string, dto: CustomerRegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.customer.findUnique({
      where: { storeId_email: { storeId, email } },
    });

    if (existing?.passwordHash) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const customer = existing
      ? await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: dto.name.trim(),
            phone: dto.phone?.trim() || existing.phone,
            passwordHash,
          },
        })
      : await this.prisma.customer.create({
          data: {
            storeId,
            email,
            name: dto.name.trim(),
            phone: dto.phone?.trim() || null,
            passwordHash,
          },
        });

    return this.tokenFor(customer);
  }

  async login(storeId: string, dto: CustomerLoginDto) {
    const email = dto.email.toLowerCase().trim();
    const customer = await this.prisma.customer.findUnique({
      where: { storeId_email: { storeId, email } },
    });

    if (!customer?.passwordHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.tokenFor(customer);
  }

  /**
   * Sempre responde ok (não vaza se o e-mail existe).
   * Envia link se a conta existir e SMTP estiver ok (em dev loga o link).
   */
  async forgotPassword(storeId: string, dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: {
        slug: true,
        name: true,
        customDomain: true,
        accentColor: true,
      },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');

    const customer = await this.prisma.customer.findUnique({
      where: { storeId_email: { storeId, email } },
    });

    if (customer?.passwordHash) {
      const raw = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(raw).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.passwordResetToken.create({
        data: {
          subject: 'CUSTOMER',
          email,
          storeId,
          tokenHash,
          expiresAt,
        },
      });

      const base = this.customerAppBaseUrl(store);
      const link = `${base}/conta/redefinir-senha?token=${raw}`;
      const mail = buildPasswordResetEmail({
        storeName: store.name,
        resetUrl: link,
        audience: 'customer',
        accentColor: store.accentColor || undefined,
      });

      await this.mail.send({
        to: email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    }

    return {
      ok: true,
      message:
        'Se existir conta com este e-mail, enviamos instruções para redefinir a senha.',
    };
  }

  async resetPassword(storeId: string, dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      !row ||
      row.subject !== 'CUSTOMER' ||
      row.storeId !== storeId ||
      row.usedAt ||
      row.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Link inválido ou expirado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const customer = await this.prisma.customer.findUnique({
      where: {
        storeId_email: { storeId, email: row.email },
      },
    });
    if (!customer) {
      throw new BadRequestException('Link inválido ou expirado');
    }

    await this.prisma.$transaction([
      // tokenVersion++ derruba sessões abertas com a senha antiga
      this.prisma.customer.update({
        where: { id: customer.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { ok: true, message: 'Senha atualizada. Você já pode entrar.' };
  }

  private customerAppBaseUrl(store: {
    slug: string;
    customDomain: string | null;
  }) {
    if (store.customDomain) {
      return `https://${store.customDomain}`;
    }
    const front =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:3000';
    return `${front}/loja/${store.slug}`;
  }

  async me(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!customer) throw new UnauthorizedException();

    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      cpf: customer.cpf,
      storeId: customer.storeId,
      addresses: customer.addresses,
    };
  }

  async listFavorites(storeId: string, customerId: string) {
    await this.ensureCustomer(storeId, customerId);
    const rows = await this.prisma.favorite.findMany({
      where: { customerId },
      select: { productId: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => r.productId);
  }

  async addFavorite(storeId: string, customerId: string, productId: string) {
    await this.ensureCustomer(storeId, customerId);
    const product = await this.prisma.product.findFirst({
      where: { storeId, id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    await this.prisma.favorite.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { storeId, customerId, productId },
      update: {},
    });
    return { ok: true };
  }

  async removeFavorite(storeId: string, customerId: string, productId: string) {
    await this.ensureCustomer(storeId, customerId);
    await this.prisma.favorite.deleteMany({ where: { customerId, productId } });
    return { ok: true };
  }

  async listAddresses(storeId: string, customerId: string) {
    await this.ensureCustomer(storeId, customerId);
    return this.prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(storeId: string, customerId: string, dto: AddressDto) {
    await this.ensureCustomer(storeId, customerId);
    const zipCode = dto.zipCode.replace(/\D/g, '');
    if (zipCode.length !== 8) {
      throw new BadRequestException('CEP inválido');
    }

    const count = await this.prisma.address.count({ where: { customerId } });
    const isDefault = dto.isDefault === true || count === 0;

    if (isDefault) {
      await this.prisma.address.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.create({
      data: {
        customerId,
        label: dto.label?.trim() || null,
        street: dto.street.trim(),
        number: dto.number.trim(),
        complement: dto.complement?.trim() || null,
        neighborhood: dto.neighborhood.trim(),
        city: dto.city.trim(),
        state: dto.state.trim().toUpperCase().slice(0, 2),
        zipCode,
        isDefault,
      },
    });
  }

  async updateAddress(
    storeId: string,
    customerId: string,
    addressId: string,
    dto: AddressDto,
  ) {
    await this.ensureCustomer(storeId, customerId);
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, customerId },
    });
    if (!address) throw new NotFoundException('Endereço não encontrado');

    const zipCode = dto.zipCode.replace(/\D/g, '');
    if (zipCode.length !== 8) {
      throw new BadRequestException('CEP inválido');
    }

    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data: {
        label: dto.label?.trim() || null,
        street: dto.street.trim(),
        number: dto.number.trim(),
        complement: dto.complement?.trim() || null,
        neighborhood: dto.neighborhood.trim(),
        city: dto.city.trim(),
        state: dto.state.trim().toUpperCase().slice(0, 2),
        zipCode,
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
  }

  async setDefaultAddress(
    storeId: string,
    customerId: string,
    addressId: string,
  ) {
    await this.ensureCustomer(storeId, customerId);
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, customerId },
    });
    if (!address) throw new NotFoundException('Endereço não encontrado');

    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { customerId },
        data: { isDefault: false },
      }),
      this.prisma.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      }),
    ]);

    return this.prisma.address.findUnique({ where: { id: addressId } });
  }

  async deleteAddress(storeId: string, customerId: string, addressId: string) {
    await this.ensureCustomer(storeId, customerId);
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, customerId },
    });
    if (!address) throw new NotFoundException('Endereço não encontrado');

    await this.prisma.address.delete({ where: { id: addressId } });

    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await this.prisma.address.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return { ok: true };
  }

  private async ensureCustomer(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });
    if (!customer) throw new UnauthorizedException();
    return customer;
  }
}
