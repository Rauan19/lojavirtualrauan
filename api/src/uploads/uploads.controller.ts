import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import type { TenantStore } from '../common/decorators/current-store.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { optimizeImage, THUMB_SUFFIX } from './image-optimizer';
import { UploadsService } from './uploads.service';

@Controller('admin/uploads')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(Role.STORE_ADMIN, Role.SUPER_ADMIN)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('Apenas imagens'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @CurrentStore() store: TenantStore,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatório');
    }

    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (!allowed.includes(ext)) {
      throw new BadRequestException('Formato de imagem inválido');
    }

    let optimized: Awaited<ReturnType<typeof optimizeImage>>;
    try {
      optimized = await optimizeImage(file.buffer);
    } catch {
      throw new BadRequestException(
        'Não foi possível ler a imagem. Envie um JPG, PNG ou WebP válido.',
      );
    }

    // Sempre .webp, seja qual for o formato enviado; a miniatura vai ao lado
    const dir = this.uploadsService.storageDestination(store.id);
    const id = randomUUID();
    await Promise.all([
      writeFile(join(dir, `${id}.webp`), optimized.main),
      writeFile(join(dir, `${id}${THUMB_SUFFIX}.webp`), optimized.thumb),
    ]);

    return this.uploadsService.toPublicUrl(store.id, `${id}.webp`);
  }
}
