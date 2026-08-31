import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadsService {
  private readonly uploadDir: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.uploadDir = config.get<string>('UPLOAD_DIR') || 'uploads';
    this.publicUrl =
      config.get<string>('PUBLIC_URL') || 'http://localhost:3000';
  }

  ensureStoreDir(storeId: string) {
    const dir = join(process.cwd(), this.uploadDir, storeId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  saveFile(storeId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatório');
    }

    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      throw new BadRequestException('Formato de imagem inválido');
    }

    const dir = this.ensureStoreDir(storeId);
    const filename = `${randomUUID()}${ext}`;
    const fullPath = join(dir, filename);

    // multer memory -> we write via disk storage in controller typically;
    // when using diskStorage, file.path already exists.
    const relative = `/${this.uploadDir}/${storeId}/${filename}`;

    return {
      url: `${this.publicUrl}${relative}`,
      path: relative,
      filename,
      fullPath,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  storageDestination(storeId: string) {
    return this.ensureStoreDir(storeId);
  }

  filename(
    _req: unknown,
    file: Express.Multer.File,
    cb: (e: Error | null, name: string) => void,
  ) {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  }

  toPublicUrl(storeId: string, filename: string) {
    const relative = `/${this.uploadDir}/${storeId}/${filename}`;
    return {
      url: `${this.publicUrl}${relative}`,
      path: relative,
    };
  }
}
