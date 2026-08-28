import { StoreType } from '@prisma/client';
import { categoriesForStoreType } from '../stores/store-type';

/** @deprecated Prefer categoriesForStoreType(storeType) — mantido para compat. */
export const DEFAULT_STORE_CATEGORIES = categoriesForStoreType(
  StoreType.FASHION,
);

export { categoriesForStoreType };
