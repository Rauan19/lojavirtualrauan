import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class CustomerJwtGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Faça login para continuar');
    }
    const u = user as unknown as AuthUser;
    if (u.role !== Role.CUSTOMER) {
      throw new ForbiddenException('Acesso apenas para clientes da loja');
    }
    return user;
  }
}
