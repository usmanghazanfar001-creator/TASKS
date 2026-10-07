import { Star, Leaf, ShoppingCart } from "lucide-react";
import { Product, imgUrl, money } from "../api/client";
import { useCart } from "../hooks/useCart";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  async function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) {
      navigate("/login");
      return;
    }
    await addItem(product.id, 1);
  }

  return (
    <div
      onClick={() => navigate(`/products/${product.id}`)}
      className="group cursor-pointer rounded-2xl border border-ink-900/5 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative mb-3 flex h-36 items-center justify-center rounded-xl bg-gradient-to-br from-signal-500/10 to-amber-400/10">
        <span className="font-display text-3xl font-semibold text-ink-900/20">
          {product.brand_name.slice(0, 2).toUpperCase()}
        </span>
        {product.image_url && (
          <img
            src={imgUrl(product.image_url)}
            alt={product.name}
            loading="lazy"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
            className="absolute inset-0 h-full w-full rounded-xl object-cover"
          />
        )}
        {product.discount_percent > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
            -{product.discount_percent}%
          </span>
        )}
        {product.is_eco_friendly && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-500/90 p-1 text-white">
            <Leaf size={12} />
          </span>
        )}
      </div>

      <p className="text-xs font-medium uppercase tracking-wide text-ink-700/60">{product.brand_name}</p>
      <h3 className="mt-0.5 line-clamp-1 font-display text-sm font-semibold text-ink-950">{product.name}</h3>

      <div className="mt-1 flex items-center gap-1 text-xs text-ink-700/70">
        <Star size={12} className="fill-amber-400 text-amber-400" />
        {product.rating_avg > 0 ? product.rating_avg.toFixed(1) : "New"}
        {product.rating_count > 0 && <span>({product.rating_count})</span>}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-base font-bold text-ink-950">{money(product.final_price)}</span>
          {product.discount_percent > 0 && (
            <span className="text-xs text-ink-700/50 line-through">{money(product.price)}</span>
          )}
        </div>
        <button
          onClick={handleAdd}
          disabled={!product.in_stock}
          className="rounded-full bg-ink-950 p-2 text-white transition hover:bg-signal-600 disabled:cursor-not-allowed disabled:bg-ink-900/20"
          aria-label="Add to cart"
        >
          <ShoppingCart size={14} />
        </button>
      </div>
      {!product.in_stock && <p className="mt-1 text-xs font-medium text-red-500">Out of stock</p>}
    </div>
  );
}
