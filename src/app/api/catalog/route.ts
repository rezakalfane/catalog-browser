import { getCatalog, getControlPanelBaseUrl, getProduct, getRelatedProducts } from "@/lib/bigcommerce";
import { getEnvironment, listEnvironments } from "@/lib/environments";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const rawEnvironmentId = request.nextUrl.searchParams.get("environmentId");
  const environmentId = rawEnvironmentId ? Number(rawEnvironmentId) : undefined;
  const rawCategoryId = request.nextUrl.searchParams.get("categoryId");
  const categoryId = rawCategoryId ? Number(rawCategoryId) : undefined;
  const rawProductId = request.nextUrl.searchParams.get("productId");
  const productId = rawProductId ? Number(rawProductId) : undefined;
  const relatedProductIds = (request.nextUrl.searchParams.get("relatedProductIds") || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const rawChannelId = request.nextUrl.searchParams.get("channelId");
  const channelId = rawChannelId ? Number(rawChannelId) : undefined;
  const rawPage = Number(request.nextUrl.searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 250 ? rawLimit : 30;
  const environments = listEnvironments();
  const environment = getEnvironment(Number.isInteger(environmentId) ? environmentId : undefined);

  if (!environment) {
    return NextResponse.json({ configured: false, environments, categories: [], products: [] });
  }

  try {
    if (typeof productId === "number" && Number.isInteger(productId) && productId > 0) {
      const product = await getProduct(environment, productId, Number.isFinite(channelId) ? channelId : undefined);
      return NextResponse.json({ configured: true, product });
    }
    if (relatedProductIds.length) {
      const relatedProducts = await getRelatedProducts(environment, relatedProductIds, Number.isFinite(channelId) ? channelId : undefined);
      return NextResponse.json({ configured: true, relatedProducts });
    }
    const catalog = await getCatalog(
      environment,
      Number.isFinite(categoryId) ? categoryId : undefined,
      page,
      Number.isFinite(channelId) ? channelId : undefined,
      limit,
    );
    return NextResponse.json({ configured: true, activeEnvironmentId: environment.id, environments, controlPanelBaseUrl: getControlPanelBaseUrl(environment), ...catalog });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the catalog.";
    return NextResponse.json({ configured: true, error: message }, { status: 502 });
  }
}
