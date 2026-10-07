import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Star, Leaf, ArrowLeft, Truck, ShieldCheck } from "lucide-react";
import { api, Product, imgUrl, money } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (id) api.products.get(Number(id)).then(setProduct);
  }, [id]);

  if (!product) {
    return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-ink-700/60">Loading...</div>;
  }

  async function handleAdd() {
    if (!user) {
      navigate("/login");
      return;
    }
    setAdding(true);
    try {
      await addItem(product!.id, 1);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 flex items-center gap-1.5 text-sm font-medium text-ink-700/70 hover:text-ink-950"
      >
        <ArrowLeft size={15} />
        Back
      </button>

      <div className="grid gap-8 sm:grid-cols-2">
        <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-signal-500/10 to-amber-400/10">
          <span className="font-display text-6xl font-bold text-ink-900/15">
            {product.brand_name.slice(0, 2).toUpperCase()}
          </span>
          {product.image_url && (
            <img
              src={imgUrl(product.image_url)}
              alt={product.name}
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-signal-600">
            {product.brand_name} · {product.category_name}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-950">{product.name}</h1>

          <div className="mt-2 flex items-center gap-2 text-sm text-ink-700/70">
            <Star size={14} className="fill-amber-400 text-amber-400" />
            {product.rating_avg > 0 ? `${product.rating_avg.toFixed(1)} (${product.rating_count} reviews)` : "No reviews yet"}
            {product.is_eco_friendly && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                <Leaf size={11} /> Eco-friendly
              </span>
            )}
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-ink-950">{money(product.final_price)}</span>
            {product.discount_percent > 0 && (
              <>
                <span className="text-ink-700/40 line-through">{money(product.price)}</span>
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                  -{product.discount_percent}%
                </span>
              </>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ink-700/80">{product.description}</p>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-700/60">
            <span className="flex items-center gap-1.5">
              <Truck size={13} /> Delivery in a few days
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} /> Warranty included
            </span>
          </div>

          <button
            onClick={handleAdd}
            disabled={!product.in_stock || adding}
            className="mt-6 w-full rounded-full bg-ink-950 py-3 text-sm font-semibold text-white transition hover:bg-signal-600 disabled:opacity-40 sm:w-auto sm:px-8"
          >
            {product.in_stock ? (adding ? "Adding..." : "Add to Cart") : "Out of Stock"}
          </button>

          {product.tags && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {product.tags.split(",").map((t) => (
                <span key={t} className="rounded-full bg-ink-900/5 px-2.5 py-1 text-[11px] text-ink-700/60">
                  {t.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
