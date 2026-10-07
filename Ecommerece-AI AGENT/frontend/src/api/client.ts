// Production build is served by the backend itself, so use same-origin by default.
const API_BASE: string =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* no JSON body */
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Types ----------------------------------------------------------------

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  discount_percent: number;
  final_price: number;
  stock: number;
  in_stock: boolean;
  rating_avg: number;
  rating_count: number;
  color: string;
  size: string;
  weight_kg: number;
  warranty_months: number;
  delivery_days: number;
  tags: string;
  image_url: string;
  is_eco_friendly: boolean;
  brand_name: string;
  category_name: string;
}

export interface ProductInput {
  name: string;
  description: string;
  brand_name: string;
  category_name: string;
  price: number;
  discount_percent: number;
  stock: number;
  color: string;
  size: string;
  weight_kg: number;
  warranty_months: number;
  delivery_days: number;
  tags: string;
  image_url: string;
  is_eco_friendly: boolean;
}

/** Store currency. Change the label here to switch currency everywhere on the site. */
export const CURRENCY_LABEL = "Rs.";
export function money(n: number): string {
  return `${CURRENCY_LABEL} ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

/** Turns an uploaded-image path (/uploads/x.jpg) into a loadable URL; external links pass through. */
export function imgUrl(url: string): string {
  if (!url) return "";
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "customer" | "admin" | "support_agent";
  preferred_currency: string;
}

export interface CartItemOut {
  id: number;
  quantity: number;
  product: Product;
}

export interface Cart {
  items: CartItemOut[];
  subtotal: number;
  item_count: number;
}

export interface Order {
  id: number;
  order_number: string;
  status: string;
  subtotal: number;
  discount_total: number;
  shipping_cost: number;
  total: number;
  created_at: string;
  estimated_delivery: string | null;
  items: { product_id: number; product_name: string; unit_price: number; quantity: number }[];
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  tool_calls: string[];
}

// --- API surface ------------------------------------------------------------

export const api = {
  auth: {
    register: (email: string, password: string, full_name: string) =>
      request<{ access_token: string; user: User }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, full_name }),
      }),
    login: (email: string, password: string) =>
      request<{ access_token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<User>("/api/auth/me"),
  },
  products: {
    list: (params: Record<string, string | number | boolean | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v));
      });
      return request<Product[]>(`/api/products?${qs.toString()}`);
    },
    get: (id: number) => request<Product>(`/api/products/${id}`),
  },
  cart: {
    get: () => request<Cart>("/api/cart"),
    add: (product_id: number, quantity = 1) =>
      request<Cart>("/api/cart/items", { method: "POST", body: JSON.stringify({ product_id, quantity }) }),
    updateQty: (itemId: number, quantity: number) =>
      request<Cart>(`/api/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
    remove: (itemId: number) => request<Cart>(`/api/cart/items/${itemId}`, { method: "DELETE" }),
  },
  coupons: {
    validate: (code: string, order_subtotal: number) =>
      request<{ valid: boolean; message: string; discount_amount: number; final_total: number }>(
        "/api/coupons/validate",
        { method: "POST", body: JSON.stringify({ code, order_subtotal }) }
      ),
  },
  orders: {
    checkout: (coupon_code: string, payment_method = "card") =>
      request<Order>("/api/orders", { method: "POST", body: JSON.stringify({ coupon_code, payment_method }) }),
    list: () => request<Order[]>("/api/orders"),
    get: (ref: string) => request<Order>(`/api/orders/${ref}`),
    cancel: (ref: string, reason = "") =>
      request<Order>(`/api/orders/${ref}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  },
  admin: {
    createProduct: (p: ProductInput) =>
      request<Product>("/api/products", { method: "POST", body: JSON.stringify(p) }),
    updateProduct: (id: number, p: ProductInput) =>
      request<Product>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
    deleteProduct: (id: number) => request<void>(`/api/products/${id}`, { method: "DELETE" }),
    uploadImage: async (file: File): Promise<string> => {
      const body = new FormData();
      body.append("file", file);
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/products/upload-image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      if (!res.ok) {
        let detail = "Upload failed";
        try {
          detail = (await res.json()).detail || detail;
        } catch {
          /* ignore */
        }
        throw new ApiError(res.status, typeof detail === "string" ? detail : "Upload failed");
      }
      return (await res.json()).url as string;
    },
  },
  chat: {
    send: (session_id: string, message: string) =>
      request<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify({ session_id, message }) }),
  },
};

export { getToken };
export function setToken(token: string | null) {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}
