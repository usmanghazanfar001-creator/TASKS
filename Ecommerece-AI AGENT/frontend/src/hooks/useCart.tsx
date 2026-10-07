import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from "react";
import { api, Cart } from "../api/client";
import { useAuth } from "./useAuth";

interface CartState {
  cart: Cart | null;
  loading: boolean;
  refresh: () => Promise<void>;
  addItem: (productId: number, quantity?: number) => Promise<void>;
  updateQty: (itemId: number, quantity: number) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(null);
      return;
    }
    setLoading(true);
    try {
      setCart(await api.cart.get());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addItem(productId: number, quantity = 1) {
    setCart(await api.cart.add(productId, quantity));
  }

  async function updateQty(itemId: number, quantity: number) {
    setCart(await api.cart.updateQty(itemId, quantity));
  }

  async function removeItem(itemId: number) {
    setCart(await api.cart.remove(itemId));
  }

  return (
    <CartContext.Provider value={{ cart, loading, refresh, addItem, updateQty, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
