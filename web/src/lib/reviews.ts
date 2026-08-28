import { api } from '@/lib/api';

export type ProductRating = { avg: number; count: number } | null;

export type Review = {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  customerName: string;
  verifiedPurchase?: boolean;
};

export type ReviewsResponse = {
  items: Review[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  avgRating: number;
};

export function fetchReviews(
  storeSlug: string,
  idOrSlug: string,
  page = 1,
  limit = 10,
) {
  return api<ReviewsResponse>(
    `/catalog/products/${idOrSlug}/reviews?page=${page}&limit=${limit}`,
    { storeSlug },
  );
}

export function createReview(
  storeSlug: string,
  token: string,
  body: { productId: string; rating: number; comment?: string },
) {
  return api<Review>('/storefront/reviews', {
    method: 'POST',
    storeSlug,
    token,
    body,
  });
}
