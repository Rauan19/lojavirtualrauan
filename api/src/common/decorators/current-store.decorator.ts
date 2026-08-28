import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export type TenantStore = {
  id: string;
  slug: string;
  name: string;
  status: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customDomain: string | null;
};

export const CurrentStore = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantStore | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { store?: TenantStore }>();
    return request.store;
  },
);
