import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import type { TenantStore } from '../../common/decorators/current-store.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { ImportacaoService } from './importacao.service';

@Controller('admin/products/importar')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
export class ImportacaoController {
  constructor(private readonly importacao: ImportacaoService) {}

  /**
   * POST com a planilha (campo "arquivo"). Sem ?confirmar=1 só mostra a
   * prévia; com ?confirmar=1 grava.
   */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /\.(csv|txt)$/i.test(file.originalname || '');
        if (!ok) {
          cb(
            new BadRequestException(
              'Envie a planilha em CSV (no Excel: Salvar como → CSV).',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  enviar(
    @CurrentStore() store: TenantStore,
    @UploadedFile() arquivo: Express.Multer.File,
    @Query('confirmar') confirmar?: string,
  ) {
    return confirmar === '1'
      ? this.importacao.importar(store.id, arquivo?.buffer)
      : this.importacao.previa(store.id, arquivo?.buffer);
  }
}
