import { Suspense } from "react";
import CatalogBrowser from "@/components/catalog-browser";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <CatalogBrowser />
    </Suspense>
  );
}
