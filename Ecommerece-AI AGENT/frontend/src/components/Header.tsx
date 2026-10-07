import { Link, useNavigate } from "react-router-dom";
import { ShoppingCart, Sparkles, LogOut, PackageSearch, Store } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";

export default function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-ink-900/5 bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-950 text-white">
            <Sparkles size={16} />
          </span>
          <span className="font-display text-lg font-bold text-ink-950">Aria Shop</span>
        </Link>

        <nav className="flex items-center gap-2">
          {user?.role === "admin" && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 rounded-full bg-signal-600/10 px-3 py-2 text-sm font-semibold text-signal-600 hover:bg-signal-600/20"
            >
              <Store size={16} />
              <span className="hidden sm:inline">Manage store</span>
            </Link>
          )}

          {user && (
            <Link
              to="/orders"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-900/5 sm:flex"
            >
              <PackageSearch size={16} />
              Orders
            </Link>
          )}

          <Link
            to="/cart"
            className="relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-900/5"
          >
            <ShoppingCart size={16} />
            <span className="hidden sm:inline">Cart</span>
            {cart && cart.item_count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-600 px-1 text-[10px] font-bold text-white">
                {cart.item_count}
              </span>
            )}
          </Link>

          {user ? (
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="flex items-center gap-1.5 rounded-full bg-ink-950 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">{user.full_name.split(" ")[0]}</span>
            </button>
          ) : (
            <Link
              to="/login"
              className="rounded-full bg-ink-950 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
