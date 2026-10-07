import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, PackageX, Truck } from "lucide-react";
import { api, Order, ApiError, money } from "../api/client";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  confirmed: "bg-signal-500/10 text-signal-600",
  shipped: "bg-signal-500/10 text-signal-600",
  out_for_delivery: "bg-signal-500/10 text-signal-600",
  delivered: "bg-emerald-50 text-emerald-600",
  cancelled: "bg-red-50 text-red-500",
  returned: "bg-ink-900/5 text-ink-700",
};

export default function Orders() {
  const location = useLocation();
  const justPlaced = (location.state as { justPlaced?: string } | null)?.justPlaced;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.orders.list().then(setOrders).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCancel(orderNumber: string) {
    setCancellingId(orderNumber);
    try {
      await api.orders.cancel(orderNumber, "Cancelled by customer from order history");
      load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Could not cancel order");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 font-display text-2xl font-bold text-ink-950">Your Orders</h1>

      {justPlaced && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={16} />
          Order {justPlaced} placed successfully!
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/60" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-700/60">You haven't placed any orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-ink-900/5 bg-white p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display text-sm font-semibold text-ink-950">{o.order_number}</p>
                  <p className="text-xs text-ink-700/50">{new Date(o.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[o.status] || ""}`}>
                  {o.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="mt-3 space-y-1 border-t border-ink-900/5 pt-3">
                {o.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm text-ink-700/80">
                    <span>
                      {item.quantity} x {item.product_name}
                    </span>
                    <span>{money((item.unit_price * item.quantity))}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-ink-900/5 pt-3">
                <div className="flex items-center gap-1.5 text-xs text-ink-700/60">
                  <Truck size={13} />
                  {o.estimated_delivery
                    ? `Est. delivery ${new Date(o.estimated_delivery).toLocaleDateString()}`
                    : "No delivery estimate"}
                </div>
                <span className="font-display text-sm font-bold text-ink-950">{money(o.total)}</span>
              </div>

              {["pending", "confirmed"].includes(o.status) && (
                <button
                  onClick={() => handleCancel(o.order_number)}
                  disabled={cancellingId === o.order_number}
                  className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
                >
                  <PackageX size={13} />
                  {cancellingId === o.order_number ? "Cancelling..." : "Cancel order"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
