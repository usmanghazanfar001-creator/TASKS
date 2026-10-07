import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, Trash2, Tag, ShoppingBag } from "lucide-react";
import { useCart } from "../hooks/useCart";
import { api, ApiError, imgUrl, money } from "../api/client";

export default function CartPage() {
  const { cart, updateQty, removeItem, refresh } = useCart();
  const navigate = useNavigate();
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<{ valid: boolean; message: string; discount_amount: number } | null>(
    null
  );
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");

  if (!cart || cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <ShoppingBag className="mx-auto mb-3 text-ink-900/20" size={40} />
        <p className="text-sm text-ink-700/60">Your cart is empty.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-4 rounded-full bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-signal-600"
        >
          Browse products
        </button>
      </div>
    );
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    const res = await api.coupons.validate(couponCode.trim(), cart!.subtotal);
    setCouponResult(res);
  }

  async function handleCheckout() {
    setCheckingOut(true);
    setError("");
    try {
      const order = await api.orders.checkout(couponResult?.valid ? couponCode.trim() : "");
      await refresh();
      navigate("/orders", { state: { justPlaced: order.order_number } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Checkout failed. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  }

  const discount = couponResult?.valid ? couponResult.discount_amount : 0;
  const total = Math.max(cart.subtotal - discount, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-ink-950">Your Cart</h1>

      <div className="space-y-3">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-ink-900/5 bg-white p-4 shadow-soft">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-signal-500/10 to-amber-400/10 font-display text-lg font-semibold text-ink-900/25">
              {item.product.brand_name.slice(0, 2).toUpperCase()}
              {item.product.image_url && (
                <img
                  src={imgUrl(item.product.image_url)}
                  alt={item.product.name}
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold text-ink-950">{item.product.name}</p>
              <p className="text-xs text-ink-700/60">{money(item.product.final_price)} each</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-ink-900/10 px-1.5 py-1">
              <button
                onClick={() => (item.quantity <= 1 ? removeItem(item.id) : updateQty(item.id, item.quantity - 1))}
                className="rounded-full p-1 hover:bg-ink-900/5"
              >
                <Minus size={12} />
              </button>
              <span className="w-4 text-center text-sm font-medium">{item.quantity}</span>
              <button onClick={() => updateQty(item.id, item.quantity + 1)} className="rounded-full p-1 hover:bg-ink-900/5">
                <Plus size={12} />
              </button>
            </div>
            <p className="w-16 text-right font-display text-sm font-semibold text-ink-950">
              {money((item.product.final_price * item.quantity))}
            </p>
            <button onClick={() => removeItem(item.id)} className="text-ink-700/30 hover:text-red-500">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-ink-900/5 bg-white p-5 shadow-soft">
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-700/40" />
            <input
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponResult(null);
              }}
              placeholder="Coupon code (try WELCOME10)"
              className="w-full rounded-full border border-ink-900/10 bg-paper py-2 pl-9 pr-3 text-sm outline-none focus:border-signal-500"
            />
          </div>
          <button
            onClick={applyCoupon}
            className="rounded-full bg-ink-900/5 px-4 py-2 text-sm font-medium text-ink-950 hover:bg-ink-900/10"
          >
            Apply
          </button>
        </div>
        {couponResult && (
          <p className={`mb-3 text-xs font-medium ${couponResult.valid ? "text-emerald-600" : "text-red-500"}`}>
            {couponResult.message}
          </p>
        )}

        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-ink-700/70">
            <span>Subtotal</span>
            <span>{money(cart.subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>-{money(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-ink-700/70">
            <span>Shipping</span>
            <span>{cart.subtotal - discount >= 75 ? "Free" : "Calculated at checkout"}</span>
          </div>
          <div className="flex justify-between border-t border-ink-900/5 pt-2 font-display text-base font-bold text-ink-950">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </div>

        {error && <p className="mt-3 text-xs font-medium text-red-500">{error}</p>}

        <button
          onClick={handleCheckout}
          disabled={checkingOut}
          className="mt-4 w-full rounded-full bg-ink-950 py-3 text-sm font-semibold text-white transition hover:bg-signal-600 disabled:opacity-50"
        >
          {checkingOut ? "Placing order..." : "Checkout"}
        </button>
      </div>
    </div>
  );
}
