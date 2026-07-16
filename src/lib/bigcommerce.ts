import type { EnvironmentCredentials } from "@/lib/environments";

export type Category = {
  id: number;
  parent_id: number;
  name: string;
  product_count?: number;
};

export type Channel = {
  id: number;
  name: string;
};

type CatalogTree = {
  id: number;
  channels: number[];
};

type TreeCategory = Category & {
  children: TreeCategory[];
};

function flattenTreeCategories(items: TreeCategory[]): Category[] {
  return items.flatMap(({ children, ...category }) => [category, ...flattenTreeCategories(children)]);
}

export type ProductImage = {
  url_zoom: string;
  url_standard: string;
  url_thumbnail: string;
  alt_text: string;
  is_thumbnail: boolean;
};

export type ProductVariant = {
  id: number;
  sku: string;
  price: number | null;
  sale_price: number | null;
  image_url: string;
  option_values: { option_display_name: string; label: string }[];
};

export type Product = {
  [key: string]: unknown;
  id: number;
  name: string;
  sku: string;
  description: string;
  price: number;
  sale_price: number | null;
  retail_price: number | null;
  brand_id: number;
  categories: number[];
  availability: string;
  inventory_level: number | null;
  images: ProductImage[];
  variants: ProductVariant[];
};

export type Pagination = {
  current_page: number;
  total_pages: number;
  total: number;
};

type ApiResponse<T> = { data: T; meta?: { pagination?: Pagination } };

export function getControlPanelBaseUrl(environment: EnvironmentCredentials) {
  return `https://store-${environment.storeHash}.mybigcommerce.com/manage/products`;
}

async function request<T>(environment: EnvironmentCredentials, path: string, fresh = false) {
  const response = await fetch(
    `https://api.bigcommerce.com/stores/${environment.storeHash}/v3/${path}`,
    {
      headers: {
        "X-Auth-Token": environment.accessToken,
        Accept: "application/json",
      },
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BigCommerce request to ${path} failed (${response.status}): ${body.slice(0, 300)}`);
  }

  return (await response.json()) as ApiResponse<T>;
}

export async function getCatalog(environment: EnvironmentCredentials, categoryId?: number, page = 1, requestedChannelId?: number, limit = 30) {
  const channels = (await request<Channel[]>(environment, "channels")).data;
  const activeChannelId = channels.find((channel) => channel.id === requestedChannelId)?.id ?? channels[0]?.id;
  const channelFilter = activeChannelId ? `&channel_id=${activeChannelId}` : "";
  const categories = activeChannelId
    ? request<CatalogTree[]>(environment, "catalog/trees").then(async (trees) => {
        const tree = trees.data.find((item) => item.channels.includes(activeChannelId));
        if (!tree) throw new Error(`No category tree is assigned to channel ${activeChannelId}.`);
        const treeCategories = await request<TreeCategory[]>(environment, `catalog/trees/${tree.id}/categories`);
        const activeCategories = flattenTreeCategories(treeCategories.data);
        return {
          categories: activeCategories,
          categoryNames: Object.fromEntries(activeCategories.map((category) => [category.id, category.name])),
        };
      })
    : request<Category[]>(environment, "catalog/categories?limit=250").then((response) => ({
        categories: response.data,
        categoryNames: Object.fromEntries(response.data.map((category) => [category.id, category.name])),
      }));
  const [categoryData, products] = await Promise.all([
    categories,
    request<Product[]>(environment,
      `catalog/products?limit=${limit}&page=${page}&include=images,variants,custom_fields,bulk_pricing_rules,primary_image,modifiers,options${
        categoryId ? `&categories:in=${categoryId}` : ""
      }${channelFilter}`,
    ),
  ]);

  return {
    activeChannelId,
    categories: categoryData.categories,
    categoryNames: categoryData.categoryNames,
    channels,
    products: products.data,
    pagination: products.meta?.pagination,
    selectableChannels: true,
  };
}

export async function getProduct(environment: EnvironmentCredentials, productId: number, channelId?: number) {
  const channelFilter = channelId ? `&channel_id=${channelId}` : "";
  const product = await request<Product>(environment,
    `catalog/products/${productId}?include=images,variants,custom_fields,bulk_pricing_rules,primary_image,modifiers,options${channelFilter}`,
    true,
  );
  return product.data;
}

export async function getRelatedProducts(environment: EnvironmentCredentials, productIds: number[], channelId?: number) {
  if (!productIds.length) return [];
  const channelFilter = channelId ? `&channel_id=${channelId}` : "";
  return (await request<Product[]>(environment, `catalog/products?id:in=${productIds.join(",")}&limit=${productIds.length}${channelFilter}`, true)).data;
}
