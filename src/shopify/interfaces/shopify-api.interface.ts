// Shopify API Response Interfaces

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  published_at: string;
  tags: string;
  status: 'active' | 'archived' | 'draft';
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  featured_image: ShopifyImage | null;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string | null;
  position: number;
  inventory_policy: string;
  compare_at_price: string | null;
  fulfillment_service: string;
  inventory_management: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode: string | null;
  grams: number;
  image_id: number | null;
  weight: number;
  weight_unit: string;
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  position: number;
  created_at: string;
  updated_at: string;
  alt: string | null;
  width: number;
  height: number;
  src: string;
  variant_ids: number[];
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOrder {
  id: number;
  email: string;
  phone: string;
  customer: ShopifyCustomer;
  order_number: number;
  name: string;
  created_at: string;
  updated_at: string;
  processed_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  total_tax: string;
  currency: string;
  line_items: ShopifyLineItem[];
}

export interface ShopifyLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string;
  quantity: number;
  price: string;
  sku: string | null;
}

export interface ShopifySearchResponse {
  products: ShopifyProduct[];
}

export interface ShopifyApiError {
  errors: Record<string, string[]>;
}
