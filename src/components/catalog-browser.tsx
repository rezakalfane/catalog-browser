"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Category, Channel, Pagination, Product } from "@/lib/bigcommerce";
import type { AppPreferences, EnvironmentSummary } from "@/lib/environments";
import EnvironmentSettings from "@/components/environment-settings";

type Catalog = { configured: boolean; activeEnvironmentId?: number; activeChannelId?: number; categories: Category[]; categoryNames?: Record<string, string>; channels?: Channel[]; environments?: EnvironmentSummary[]; products: Product[]; pagination?: Pagination; selectableChannels?: boolean; controlPanelBaseUrl?: string; error?: string };

const price = (value: number | null) => value ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value) : null;
const text = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
const fieldLabel = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const savePreferences = (preferences: Partial<AppPreferences>) => fetch("/api/preferences", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(preferences),
}).catch(() => {});

function ProductCategories({ product, categories, categoryNames }: { product: Product; categories: Category[]; categoryNames?: Record<string, string> }) {
  const productCategories = product.categories.flatMap((id) => {
    const category = categories.find((item) => item.id === id);
    const name = categoryNames?.[id] ?? category?.name;
    if (!name) return [];
    const path: string[] = [];
    for (let current = category; current; current = categories.find((item) => item.id === current.parent_id)) {
      path.unshift(current.name);
    }
    return [{ id, name: path.join(" / ") || name }];
  });
  if (!productCategories.length) return null;
  return <section className="custom-fields"><h3>Categories</h3><table><thead><tr><th>Breadcrumb</th><th>ID</th></tr></thead><tbody>{productCategories.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.id}</td></tr>)}</tbody></table></section>;
}

function RelatedProducts({ products }: { products: Product[] }) {
  if (!products.length) return null;
  return <section className="custom-fields"><h3>Related products</h3><table><thead><tr><th>Product name</th><th>ID</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.id}</td></tr>)}</tbody></table></section>;
}

function ProductAttributes({ product }: { product: Product }) {
  const excluded = new Set(["id", "name", "description", "images", "variants", "categories", "custom_fields"]);
  const scalarFields = Object.entries(product).filter(([key, value]) => !excluded.has(key) && value !== null && value !== "" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"));
  const complexFields = Object.entries(product).filter(([key, value]) => !excluded.has(key) && value !== null && typeof value === "object" && (!Array.isArray(value) || value.length > 0));
  const customFields = Array.isArray(product.custom_fields) ? product.custom_fields.filter((field): field is Record<string, unknown> => Boolean(field && typeof field === "object")) : [];
  const formatValue = (value: string | number | boolean) => typeof value === "boolean" ? value ? "Yes" : "No" : String(value);

  return <>{customFields.length > 0 && <section className="custom-fields"><h3>Custom fields</h3><table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody>{customFields.map((field, index) => <tr key={`${field.name}-${index}`}><td>{String(field.name ?? "")}</td><td>{String(field.value ?? "")}</td></tr>)}</tbody></table></section>}{scalarFields.length > 0 && <section className="product-attributes"><h3>Product details</h3><dl>{scalarFields.map(([key, value]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{formatValue(value as string | number | boolean)}</dd></div>)}</dl></section>}{complexFields.length > 0 && <section className="product-data"><h3>Additional product data</h3>{complexFields.map(([key, value]) => <details key={key}><summary>{fieldLabel(key)}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>)}</section>}</>;
}

function ProductImage({ product, className, zoomable = false }: { product: Product; className: string; zoomable?: boolean }) {
  const [index, setIndex] = useState(0);
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const [zoomImageLoading, setZoomImageLoading] = useState(false);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const imageRef = useRef<HTMLDivElement>(null);
  const images = [
    ...product.images.map((image) => ({ thumb: image.url_standard, full: image.url_zoom || image.url_standard })),
    ...product.variants.filter((variant) => variant.image_url).map((variant) => ({ thumb: variant.image_url, full: variant.image_url })),
  ].filter((image, position, all) => all.findIndex((other) => other.thumb === image.thumb) === position);
  const goToZoom = (nextIndex: number) => { setZoomedIndex(nextIndex); setZoomImageLoading(true); setZoomedIn(false); setZoomScale(1); };
  const closeZoom = useCallback(() => { setZoomedIndex(null); setZoomedIn(false); setZoomScale(1); }, []);
  const showPrevious = useCallback(() => {
    setZoomedIndex((current) => current === null ? current : (current - 1 + images.length) % images.length);
    setZoomImageLoading(true);
    setZoomedIn(false);
    setZoomScale(1);
  }, [images.length]);
  const showNext = useCallback(() => {
    setZoomedIndex((current) => current === null ? current : (current + 1) % images.length);
    setZoomImageLoading(true);
    setZoomedIn(false);
    setZoomScale(1);
  }, [images.length]);

  useEffect(() => {
    const element = imageRef.current;
    if (!element || !images.length) return;
    const preload = () => images.forEach((image) => { const preloaded = new Image(); preloaded.src = image.thumb; });
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { preload(); observer.disconnect(); }
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [images]);

  useEffect(() => {
    if (zoomedIndex === null) return;
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); closeZoom(); }
      else if (event.key === "ArrowLeft") { event.stopPropagation(); showPrevious(); }
      else if (event.key === "ArrowRight") { event.stopPropagation(); showNext(); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); event.stopPropagation(); setZoomedIn(true); setZoomScale((current) => Math.min(4, current + 0.5)); }
      else if (event.key === "-") { event.preventDefault(); event.stopPropagation(); setZoomScale((current) => { const next = Math.max(1, current - 0.5); setZoomedIn(next > 1); return next; }); }
      else if (event.key === "0") { event.preventDefault(); event.stopPropagation(); setZoomedIn(false); setZoomScale(1); }
    };
    window.addEventListener("keydown", navigate, true);
    return () => window.removeEventListener("keydown", navigate, true);
  }, [zoomedIndex, closeZoom, showPrevious, showNext]);

  useEffect(() => {
    if (!zoomable || zoomedIndex !== null) return;
    const isInteractive = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
    const navigate = (event: KeyboardEvent) => {
      if (isInteractive(event.target)) return;
      if (event.key === "ArrowLeft" && images.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        setIndex((current) => (current - 1 + images.length) % images.length);
      } else if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();
        event.stopPropagation();
        setIndex((current) => (current + 1) % images.length);
      } else if (event.key === "Enter" && images[index]) {
        event.preventDefault();
        event.stopPropagation();
        goToZoom(index);
      }
    };
    window.addEventListener("keydown", navigate, true);
    return () => window.removeEventListener("keydown", navigate, true);
  }, [images, index, zoomable, zoomedIndex]);

  return <>
    <div ref={imageRef} className={zoomable ? `${className} zoomable` : className} onMouseMove={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (images.length > 1) setIndex(Math.min(images.length - 1, Math.floor(((event.clientX - bounds.left) / bounds.width) * images.length)));
    }} onMouseLeave={() => { if (zoomedIndex === null) setIndex(0); }} onClick={() => { if (zoomable && images[index]) goToZoom(index); }}>
      {/* BigCommerce serves images from each store's configured CDN host. */}
      {images[index] ? <span className="image-src" role="img" aria-label={product.name} style={{ backgroundImage: `url(${images[index].thumb})` }} /> : <span className="image-fallback">No image</span>}
      {images.length > 1 && <span className="image-counter">{index + 1} / {images.length}</span>}
    </div>
    {zoomedIndex !== null && images[zoomedIndex] && <div className="image-zoom-backdrop" onClick={closeZoom}>
      <button className="image-zoom-close" onClick={closeZoom} aria-label="Close image">×</button>
      {images.length > 1 && <button className="image-zoom-nav image-zoom-prev" onClick={(event) => { event.stopPropagation(); showPrevious(); }} aria-label="Previous image">‹</button>}
      {zoomImageLoading && <span className="image-zoom-spinner" aria-hidden="true" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={images[zoomedIndex].full} className={`image-zoom-full ${zoomedIn ? "zoomed-in" : ""} ${zoomImageLoading ? "is-loading" : ""}`} src={images[zoomedIndex].full} alt={product.name} style={{ transform: zoomedIn ? `scale(${zoomScale})` : undefined, transformOrigin: zoomOrigin }} onLoad={() => setZoomImageLoading(false)} onClick={(event) => {
        event.stopPropagation();
        if (zoomImageLoading) return;
        if (!zoomedIn) {
          const bounds = event.currentTarget.getBoundingClientRect();
          setZoomOrigin(`${((event.clientX - bounds.left) / bounds.width) * 100}% ${((event.clientY - bounds.top) / bounds.height) * 100}%`);
        }
        setZoomedIn((current) => { const next = !current; if (next) setZoomScale(2); return next; });
      }} />
      {images.length > 1 && <button className="image-zoom-nav image-zoom-next" onClick={(event) => { event.stopPropagation(); showNext(); }} aria-label="Next image">›</button>}
      {images.length > 1 && <span className="image-zoom-counter">{zoomedIndex + 1} / {images.length}</span>}
    </div>}
  </>;
}

function Tree({ categories, selected, onSelect }: { categories: Category[]; selected: number | null; onSelect: (id: number | null) => void }) {
  const [open, setOpen] = useState<number[]>([]);
  const render = (category: Category, depth = 0): React.ReactNode => {
    const children = categories.filter((item) => item.parent_id === category.id);
    const expanded = open.includes(category.id);
    return <div key={category.id}>
      <div className={`category-row ${selected === category.id ? "selected" : ""}`} style={{ paddingLeft: 16 + depth * 17 }}>
        {children.length ? <button className="tree-toggle" onClick={() => setOpen(expanded ? open.filter((id) => id !== category.id) : [...open, category.id])}>{expanded ? "−" : "+"}</button> : <span className="tree-spacer" />}
        <button className="category-name" onClick={() => onSelect(category.id)}>{category.name}</button>
      </div>
      {expanded && children.map((child) => render(child, depth + 1))}
    </div>;
  };
  return <>{categories.filter((category) => category.parent_id === 0).map((category) => render(category))}</>;
}

export default function CatalogBrowser() {
  const [catalog, setCatalog] = useState<Catalog>({ configured: false, categories: [], products: [] });
  const [category, setCategory] = useState<number | null>(null);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<number | null>(null);
  const [requestedEnvironmentId, setRequestedEnvironmentId] = useState<number | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [requestedChannelId, setRequestedChannelId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [focusedProductId, setFocusedProductId] = useState<number | null>(null);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [columns, setColumns] = useState(3);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [drawerWidth, setDrawerWidth] = useState(630);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshingProduct, setRefreshingProduct] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [environmentVersion, setEnvironmentVersion] = useState(0);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const canLoadMoreRef = useRef(true);
  const pendingScrollYRef = useRef<number | null>(null);
  const pageSize = layout === "grid" ? columns * 10 : 30;
  const selectedProductId = selected?.id;
  const selectedRelatedProductIds = Array.isArray(selected?.related_products)
    ? selected.related_products.filter((id): id is number => typeof id === "number" && id > 0).join(",")
    : "";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/preferences", { signal: controller.signal })
      .then((response) => response.json())
      .then((data: { preferences: AppPreferences }) => {
        setRequestedEnvironmentId(data.preferences.environmentId);
        setRequestedChannelId(data.preferences.channelId);
        setCategory(data.preferences.categoryId);
        setLayout(data.preferences.layout);
        setColumns(data.preferences.density);
        setSidebarWidth(data.preferences.sidebarWidth);
        setDrawerWidth(data.preferences.drawerWidth);
        setPreferencesLoaded(true);
      })
      .catch((error: Error) => { if (error.name !== "AbortError") setPreferencesLoaded(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const stopResize = () => document.body.classList.remove("resizing-sidebar", "resizing-drawer");
    window.addEventListener("mouseup", stopResize);
    return () => window.removeEventListener("mouseup", stopResize);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: "1", limit: String(pageSize) });
    if (requestedEnvironmentId) params.set("environmentId", String(requestedEnvironmentId));
    if (category) params.set("categoryId", String(category));
    if (requestedChannelId) params.set("channelId", String(requestedChannelId));
    fetch(`/api/catalog?${params}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json() as Catalog; if (!response.ok) throw new Error(data.error); setCatalog(data); setActiveEnvironmentId(data.activeEnvironmentId ?? null); setActiveChannelId(data.activeChannelId ?? null); setSelected(null); setPage(1); setHasMore(Boolean(data.pagination && data.pagination.current_page < data.pagination.total_pages)); if (data.activeEnvironmentId && data.activeChannelId) savePreferences({ environmentId: data.activeEnvironmentId, channelId: data.activeChannelId }); })
      .catch((error: Error) => { if (error.name !== "AbortError") setCatalog((value) => ({ ...value, error: error.message })); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [category, environmentVersion, pageSize, preferencesLoaded, requestedChannelId, requestedEnvironmentId]);

  useLayoutEffect(() => {
    if (pendingScrollYRef.current === null) return;
    window.scrollTo({ top: pendingScrollYRef.current });
    pendingScrollYRef.current = null;
  }, [catalog.products]);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || !hasMore || loadingMoreRef.current || loading) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        canLoadMoreRef.current = true;
        return;
      }
      if (loadingMoreRef.current || !canLoadMoreRef.current) return;
      canLoadMoreRef.current = false;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      const params = new URLSearchParams({ page: String(page + 1), limit: String(pageSize) });
      if (requestedEnvironmentId) params.set("environmentId", String(requestedEnvironmentId));
      if (category) params.set("categoryId", String(category));
      if (requestedChannelId) params.set("channelId", String(requestedChannelId));
      fetch(`/api/catalog?${params}`, { signal: controller.signal })
        .then(async (response) => { const data = await response.json() as Catalog; if (!response.ok) throw new Error(data.error); pendingScrollYRef.current = window.scrollY; setCatalog((current) => ({ ...current, products: [...current.products, ...data.products], pagination: data.pagination })); setPage(page + 1); setHasMore(Boolean(data.pagination && data.pagination.current_page < data.pagination.total_pages)); })
        .catch((error: Error) => { if (error.name !== "AbortError") setCatalog((current) => ({ ...current, error: error.message })); })
        .finally(() => { loadingMoreRef.current = false; setLoadingMore(false); });
    }, { rootMargin: "400px" });
    observer.observe(element);
    return () => { observer.disconnect(); controller.abort(); };
  }, [category, hasMore, loading, page, pageSize, requestedChannelId, requestedEnvironmentId]);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  useEffect(() => {
    const isInteractive = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isInteractive(event.target) || selected || settingsOpen) return;

      if (event.key === "Escape" && focusedProductId) {
        setIsKeyboardNavigating(false);
        return;
      }
      if (event.key === "g") {
        if (layout !== "grid") { setLoading(true); setHasMore(false); setLayout("grid"); savePreferences({ layout: "grid" }); }
        return;
      }
      if (event.key === "l") {
        if (layout !== "list") { setLoading(true); setHasMore(false); setLayout("list"); savePreferences({ layout: "list" }); }
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        if (layout === "grid" && columns < 6) { setLoading(true); setHasMore(false); setColumns(columns + 1); savePreferences({ density: columns + 1 }); }
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        if (layout === "grid" && columns > 2) { setLoading(true); setHasMore(false); setColumns(columns - 1); savePreferences({ density: columns - 1 }); }
        return;
      }
      if (event.key === "Enter") {
        const product = catalog.products.find((item) => item.id === focusedProductId);
        if (product) { setRelatedProducts([]); setSelected(product); }
        return;
      }

      const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? layout === "grid" ? -columns : -1 : event.key === "ArrowDown" ? layout === "grid" ? columns : 1 : 0;
      if (!direction || !catalog.products.length) return;
      event.preventDefault();
      const currentIndex = catalog.products.findIndex((product) => product.id === focusedProductId);
      const nextIndex = currentIndex < 0 ? direction > 0 ? 0 : catalog.products.length - 1 : Math.min(catalog.products.length - 1, Math.max(0, currentIndex + direction));
      setIsKeyboardNavigating(true);
      setFocusedProductId(catalog.products[nextIndex].id);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [catalog.products, columns, focusedProductId, layout, selected, settingsOpen]);

  useEffect(() => {
    if (!isKeyboardNavigating || !focusedProductId) return;
    document.querySelector(`[data-product-id="${focusedProductId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusedProductId, isKeyboardNavigating]);

  useEffect(() => {
    if (!selectedProductId) return;
    if (!selectedRelatedProductIds) {
      setRelatedProducts([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ relatedProductIds: selectedRelatedProductIds });
    if (activeEnvironmentId) params.set("environmentId", String(activeEnvironmentId));
    if (activeChannelId) params.set("channelId", String(activeChannelId));
    fetch(`/api/catalog?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json() as { relatedProducts?: Product[] }; if (response.ok) setRelatedProducts(data.relatedProducts || []); })
      .catch(() => {});
    return () => controller.abort();
  }, [activeChannelId, activeEnvironmentId, selectedProductId, selectedRelatedProductIds]);

  const categoryName = catalog.categories.find((item) => item.id === category)?.name || "All products";
  const breadcrumbs: Category[] = [];
  for (let current = catalog.categories.find((item) => item.id === category); current; current = catalog.categories.find((item) => item.id === current.parent_id)) {
    breadcrumbs.unshift(current);
  }
  const restoreEnvironment = async (id: number | null) => {
    canLoadMoreRef.current = true;
    setPreferencesLoaded(false);
    setLoading(true);
    setHasMore(false);
    setSelected(null);
    setRelatedProducts([]);
    setCategory(null);
    setRequestedChannelId(null);
    setActiveEnvironmentId(id);
    setRequestedEnvironmentId(id);
    await savePreferences({ environmentId: id });
    try {
      const response = await fetch(`/api/preferences${id ? `?environmentId=${id}` : ""}`);
      const data = await response.json() as { preferences: AppPreferences };
      setRequestedChannelId(data.preferences.channelId);
      setCategory(data.preferences.categoryId);
    } finally {
      setPreferencesLoaded(true);
    }
  };
  const changeCategory = (id: number | null) => { if (id === category) return; canLoadMoreRef.current = true; setLoading(true); setHasMore(false); setCategory(id); savePreferences({ environmentId: activeEnvironmentId, categoryId: id }); };
  const changeEnvironment = (id: number) => { if (id !== activeEnvironmentId) restoreEnvironment(id); };
  const changeChannel = (id: number) => { if (id === activeChannelId) return; canLoadMoreRef.current = true; setLoading(true); setHasMore(false); setSelected(null); setRelatedProducts([]); setCategory(null); setActiveChannelId(id); setRequestedChannelId(id); savePreferences({ environmentId: activeEnvironmentId, channelId: id, categoryId: null }); };
  const changeLayout = (value: "grid" | "list") => { if (value === layout) return; canLoadMoreRef.current = true; setLoading(true); setHasMore(false); setLayout(value); savePreferences({ layout: value }); };
  const changeDensity = (value: number) => { if (value === columns) return; canLoadMoreRef.current = true; setLoading(true); setHasMore(false); setColumns(value); savePreferences({ density: value }); };
  const resizeSidebar = (event: React.MouseEvent) => {
    event.preventDefault();
    document.body.classList.add("resizing-sidebar");
    const move = (moveEvent: MouseEvent) => setSidebarWidth(Math.min(420, Math.max(220, moveEvent.clientX)));
    const stop = (moveEvent: MouseEvent) => {
      const width = Math.min(420, Math.max(220, moveEvent.clientX));
      setSidebarWidth(width);
      savePreferences({ sidebarWidth: width });
      document.body.classList.remove("resizing-sidebar");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };
  const resizeDrawer = (event: React.MouseEvent) => {
    event.preventDefault();
    document.body.classList.add("resizing-drawer");
    const widthFromEvent = (moveEvent: MouseEvent) => Math.min(900, Math.max(380, window.innerWidth - moveEvent.clientX));
    const move = (moveEvent: MouseEvent) => setDrawerWidth(widthFromEvent(moveEvent));
    const stop = (moveEvent: MouseEvent) => {
      const width = widthFromEvent(moveEvent);
      setDrawerWidth(width);
      savePreferences({ drawerWidth: width });
      document.body.classList.remove("resizing-drawer");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };
  const refreshSelectedProduct = async () => {
    if (!selected || refreshingProduct) return;
    setRefreshingProduct(true);
    try {
      const params = new URLSearchParams({ productId: String(selected.id) });
      if (activeEnvironmentId) params.set("environmentId", String(activeEnvironmentId));
      if (activeChannelId) params.set("channelId", String(activeChannelId));
      const response = await fetch(`/api/catalog?${params}`, { cache: "no-store" });
      const data = await response.json() as { product?: Product; error?: string };
      if (!response.ok || !data.product) throw new Error(data.error || "Unable to refresh product.");
      setSelected(data.product);
      setCatalog((current) => ({ ...current, products: current.products.map((product) => product.id === data.product?.id ? data.product : product) }));
    } catch (error) {
      setCatalog((current) => ({ ...current, error: error instanceof Error ? error.message : "Unable to refresh product." }));
    } finally {
      setRefreshingProduct(false);
    }
  };
  return <main className="catalog-shell" style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties} onMouseDown={() => setIsKeyboardNavigating(false)}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">B</span><span>BigCommerce<br /><strong>Catalog</strong></span></div>
      {catalog.environments && catalog.environments.length > 0 && <div className="channel-picker"><div className="sidebar-heading"><span>Environments</span><span>{catalog.environments.length}</span></div><div className="channel-list">{catalog.environments.map((environment) => <button key={environment.id} className={activeEnvironmentId === environment.id ? "selected" : ""} onClick={() => changeEnvironment(environment.id)}>{environment.name}</button>)}</div></div>}
      {catalog.selectableChannels && <div className="channel-picker"><div className="sidebar-heading"><span>Channels</span><span>{catalog.channels?.length || "—"}</span></div><div className="channel-list">{catalog.channels?.map((channel) => <button key={channel.id} className={activeChannelId === channel.id ? "selected" : ""} onClick={() => changeChannel(channel.id)}>{channel.name}</button>)}</div></div>}
      <div className="sidebar-heading"><span>Categories</span><span>{catalog.categories.length || "—"}</span></div>
      <button className={`all-categories ${category === null ? "selected" : ""}`} onClick={() => changeCategory(null)}>All products</button>
      <nav className="category-tree"><Tree categories={catalog.categories} selected={category} onSelect={changeCategory} /></nav>
      <div className="sidebar-foot"><button className="settings-button" onClick={() => setSettingsOpen(true)}>Settings</button><span>Catalog browser · v1.0</span></div>
      <button className="sidebar-resizer" onMouseDown={resizeSidebar} aria-label="Resize sidebar"><span className="sidebar-resizer-grip" aria-hidden="true" /></button>
    </aside>
    <section className="catalog-content">
      <header className="topbar"><div><p className="eyebrow">Product catalog</p><h1>{categoryName}</h1>{category && <nav className="breadcrumbs" aria-label="Category breadcrumb"><button onClick={() => changeCategory(null)}>All products</button>{breadcrumbs.map((item) => <span key={item.id}><i> / </i><button className={item.id === category ? "current" : ""} onClick={() => changeCategory(item.id)} disabled={item.id === category}>{item.name}</button></span>)}</nav>}</div><div className="connection"><span className={`status-dot ${catalog.configured && !catalog.error ? "online" : ""}`} />{catalog.configured && !catalog.error ? "Store connected" : "Store not connected"}</div></header>
      {!catalog.configured ? <div className="setup-state"><span className="setup-icon">⌘</span><h2>Add a BigCommerce environment</h2><p>Open Settings to add a store hash and access token. Tokens are encrypted before they are stored locally.</p><button className="settings-save" onClick={() => setSettingsOpen(true)}>Open settings</button></div> : catalog.error ? <div className="setup-state"><span className="setup-icon error">!</span><h2>We couldn’t load the catalog</h2><p>{catalog.error}</p></div> : <>
        <div className="toolbar"><span className="product-count">{loading ? "Loading products…" : `${catalog.products.length} product${catalog.products.length === 1 ? "" : "s"}`}</span><div className="toolbar-controls">{layout === "grid" && <label className="density"><span>Density</span><input type="range" min="2" max="6" value={columns} onChange={(event) => changeDensity(Number(event.target.value))} /></label>}<div className="view-switch"><button className={layout === "grid" ? "active" : ""} onClick={() => changeLayout("grid")}>▦</button><button className={layout === "list" ? "active" : ""} onClick={() => changeLayout("list")}>☷</button></div></div></div>
        {loading ? <div className="loading">Refreshing catalog…</div> : !catalog.products.length ? <div className="empty-state">No products in this category.</div> : <><div className={`products ${layout}`} style={layout === "grid" ? { "--columns": columns } as React.CSSProperties : undefined}>{catalog.products.map((product) => <article className={`product-card ${isKeyboardNavigating && focusedProductId === product.id ? "keyboard-focused" : ""}`} data-product-id={product.id} key={product.id} onClick={() => { setFocusedProductId(product.id); setRelatedProducts([]); setSelected(product); }}><ProductImage product={product} className="product-image" /><div className="product-info"><span className="product-sku">{product.sku || `ID ${product.id}`}</span><h2>{product.name}</h2><p className="product-description">{text(product.description) || "No product description available."}</p><div className="price-row"><strong>{price(product.sale_price) || price(product.price) || "—"}</strong>{product.sale_price && product.price !== product.sale_price ? <del>{price(product.price)}</del> : null}{product.retail_price ? <span>List {price(product.retail_price)}</span> : null}</div><span className="variant-count">{product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</span></div></article>)}</div><div ref={loadMoreRef} className="load-more-status">{loadingMore ? "Loading more products…" : hasMore ? "Scroll for more products" : "End of category"}</div></>}
      </>}
    </section>
    {selected && <div className="detail-backdrop" onClick={() => setSelected(null)}><aside className="product-detail" style={{ "--drawer-width": `${drawerWidth}px` } as React.CSSProperties} onClick={(event) => event.stopPropagation()}><button className="drawer-resizer" onMouseDown={resizeDrawer} aria-label="Resize product detail panel"><span className="drawer-resizer-grip" aria-hidden="true" /></button><button className="close-detail" onClick={() => setSelected(null)}>×</button><ProductImage product={selected} className="detail-image" zoomable /><p className="eyebrow">{selected.sku || `ID ${selected.id}`}</p><h2>{selected.name}</h2><div className="detail-price">{price(selected.sale_price) || price(selected.price) || "—"} {selected.retail_price ? <del>{price(selected.retail_price)}</del> : null}</div><div className="detail-actions">{catalog.controlPanelBaseUrl && <a className="control-panel-link" href={`${catalog.controlPanelBaseUrl}/${selected.id}/edit`} target="_blank" rel="noreferrer">Open in BigCommerce <span>↗</span></a>}<button className="refresh-product" onClick={refreshSelectedProduct} disabled={refreshingProduct} aria-label="Refresh product" title="Refresh product"><span className={refreshingProduct ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span></button></div>{selected.description ? <div className="detail-description" dangerouslySetInnerHTML={{ __html: selected.description }} /> : <p className="detail-description">No product description available.</p>}<ProductCategories product={selected} categories={catalog.categories} categoryNames={catalog.categoryNames} /><div className="detail-meta"><span>Availability</span><strong>{selected.availability || "Available"}</strong><span>Inventory</span><strong>{selected.inventory_level ?? "Not tracked"}</strong></div><h3>Variants <span>{selected.variants.length}</span></h3><div className="variant-list">{selected.variants.map((variant) => <div key={variant.id}><span>{variant.option_values.map((option) => option.label).join(" · ") || variant.sku || `Variant ${variant.id}`}</span><strong>{price(variant.sale_price) || price(variant.price) || "—"}</strong></div>)}</div><RelatedProducts products={relatedProducts} /><ProductAttributes product={selected} /></aside></div>}
    {settingsOpen && <EnvironmentSettings environments={catalog.environments || []} onClose={() => setSettingsOpen(false)} onReordered={(environments) => setCatalog((current) => ({ ...current, environments }))} onChanged={(environmentId) => { setSettingsOpen(false); setEnvironmentVersion((value) => value + 1); restoreEnvironment(environmentId ?? null); }} />}
  </main>;
}
