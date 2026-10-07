import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { api, Product } from "../api/client";
import ProductCard from "../components/ProductCard";

const CATEGORIES = ["Laptops", "Smartphones", "Smartwatches", "Footwear", "Home", "Audio"];

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("relevance");
  const [onSale, setOnSale] = useState(false);
  const [ecoFriendly, setEcoFriendly] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      api.products
        .list({
          q,
          category: category ? category.toLowerCase() : undefined,
          sort,
          on_sale: onSale || undefined,
          eco_friendly: ecoFriendly || undefined,
          limit: 24,
        })
        .then(setProducts)
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [q, category, sort, onSale, ecoFriendly]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 rounded-3xl bg-ink-950 px-6 py-10 text-white sm:px-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-signal-400">AI-powered shopping</p>
        <h1 className="max-w-xl font-display text-3xl font-bold sm:text-4xl">
          Tell Aria what you need — she'll find it, compare it, and check it out.
        </h1>
        <p className="mt-3 max-w-lg text-sm text-white/60">
          Or browse the catalog yourself below. Try the chat bubble in the corner for natural-language search,
          comparisons, and order tracking.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-700/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products..."
            className="w-full rounded-full border border-ink-900/10 bg-white py-2.5 pl-10 pr-4 text-sm shadow-soft outline-none focus:border-signal-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-full border border-ink-900/10 bg-white px-4 py-2.5 text-sm shadow-soft outline-none"
        >
          <option value="relevance">Relevance</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="rating">Top Rated</option>
        </select>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SlidersHorizontal size={14} className="text-ink-700/40" />
        <button
          onClick={() => setCategory("")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            category === "" ? "bg-ink-950 text-white" : "bg-white text-ink-700 hover:bg-ink-900/5"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              category === c ? "bg-ink-950 text-white" : "bg-white text-ink-700 hover:bg-ink-900/5"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ink-900/10" />
        <button
          onClick={() => setOnSale((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            onSale ? "bg-amber-500 text-white" : "bg-white text-ink-700 hover:bg-ink-900/5"
          }`}
        >
          On Sale
        </button>
        <button
          onClick={() => setEcoFriendly((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            ecoFriendly ? "bg-emerald-500 text-white" : "bg-white text-ink-700 hover:bg-ink-900/5"
          }`}
        >
          Eco-Friendly
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-700/60">No products match your filters.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
