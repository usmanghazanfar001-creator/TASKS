import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, ImagePlus, X, Search } from "lucide-react";
import { api, ApiError, imgUrl, money, Product, ProductInput } from "../api/client";
import { useAuth } from "../hooks/useAuth";

const EMPTY: ProductInput = {
  name: "",
  description: "",
  brand_name: "",
  category_name: "",
  price: 0,
  discount_percent: 0,
  stock: 10,
  color: "",
  size: "",
  weight_kg: 0,
  warranty_months: 0,
  delivery_days: 3,
  tags: "",
  image_url: "",
  is_eco_friendly: false,
};

const input =
  "w-full rounded-xl border border-ink-900/10 bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-signal-500";
const label = "mb-1 block text-xs font-medium text-ink-700/70";

function toInput(p: Product): ProductInput {
  return {
    name: p.name,
    description: p.description,
    brand_name: p.brand_name,
    category_name: p.category_name,
    price: p.price,
    discount_percent: p.discount_percent,
    stock: p.stock,
    color: p.color,
    size: p.size,
    weight_kg: p.weight_kg ?? 0,
    warranty_months: p.warranty_months ?? 0,
    delivery_days: p.delivery_days ?? 3,
    tags: p.tags,
    image_url: p.image_url,
    is_eco_friendly: p.is_eco_friendly,
  };
}

export default function Admin() {
  const { user, loading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: number | null; data: ProductInput } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    try {
      setProducts(await api.products.list({ limit: 100, sort: "relevance" }));
    } catch {
      setError("Could not load products");
    }
  }

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  const brands = useMemo(() => [...new Set(products.map((p) => p.brand_name))], [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category_name))], [products]);
  const shown = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <p className="p-8 text-center text-sm text-ink-700/60">Loading…</p>;
  if (!user || user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-xl font-bold text-ink-950">Admin only</h1>
        <p className="mt-2 text-sm text-ink-700/60">Sign in with an admin account to manage products.</p>
        <Link to="/login" className="mt-4 inline-block rounded-full bg-ink-950 px-5 py-2 text-sm font-medium text-white">
          Sign in
        </Link>
      </div>
    );
  }

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setEditing((e) => (e ? { ...e, data: { ...e.data, [key]: value } } : e));
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      set("image_url", await api.admin.uploadImage(file));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      if (editing.id === null) await api.admin.createProduct(editing.data);
      else await api.admin.updateProduct(editing.id, editing.data);
      setNotice(editing.id === null ? "Product added" : "Product updated");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    if (!window.confirm(`Remove "${p.name}" from the store?`)) return;
    try {
      await api.admin.deleteProduct(p.id);
      setNotice("Product removed");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove product");
    }
  }

  const d = editing?.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink-950">Manage products</h1>
          <p className="text-sm text-ink-700/60">{products.length} products in your store</p>
        </div>
        <button
          onClick={() => {
            setNotice("");
            setError("");
            setEditing({ id: null, data: { ...EMPTY } });
          }}
          className="flex items-center gap-1.5 rounded-full bg-ink-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-signal-600"
        >
          <Plus size={16} /> Add product
        </button>
      </div>

      {notice && <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && !editing && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3.5 top-3 text-ink-700/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your products…"
          className={`${input} pl-9`}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink-900/5 bg-white shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink-900/5 text-xs uppercase tracking-wide text-ink-700/60">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-b border-ink-900/5 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-signal-500/10 text-xs font-semibold text-ink-900/30">
                      {p.brand_name.slice(0, 2).toUpperCase()}
                      {p.image_url && (
                        <img
                          src={imgUrl(p.image_url)}
                          alt=""
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-ink-950">{p.name}</p>
                      <p className="text-xs text-ink-700/50">{p.brand_name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-700">{p.category_name}</td>
                <td className="px-4 py-3">
                  {money(p.final_price)}
                  {p.discount_percent > 0 && <span className="ml-1 text-xs text-amber-500">-{p.discount_percent}%</span>}
                </td>
                <td className={`px-4 py-3 ${p.stock === 0 ? "font-medium text-red-500" : "text-ink-700"}`}>{p.stock}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setNotice("");
                        setError("");
                        setEditing({ id: p.id, data: toInput(p) });
                      }}
                      className="rounded-full p-2 text-ink-700 hover:bg-ink-900/5"
                      aria-label="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="rounded-full p-2 text-red-500 hover:bg-red-50"
                      aria-label="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-700/50">
                  No products found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && d && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4">
          <form
            onSubmit={handleSave}
            className="my-6 w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink-950">
                {editing.id === null ? "Add a product" : "Edit product"}
              </h2>
              <button type="button" onClick={() => setEditing(null)} className="rounded-full p-1.5 hover:bg-ink-900/5">
                <X size={18} />
              </button>
            </div>

            {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

            <div>
              <label className={label}>Product name *</label>
              <input required value={d.name} onChange={(e) => set("name", e.target.value)} className={input} />
            </div>

            <div>
              <label className={label}>Description</label>
              <textarea
                rows={3}
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                className={input}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Brand *</label>
                <input
                  required
                  list="brand-list"
                  value={d.brand_name}
                  onChange={(e) => set("brand_name", e.target.value)}
                  className={input}
                />
                <datalist id="brand-list">
                  {brands.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={label}>Category *</label>
                <input
                  required
                  list="category-list"
                  value={d.category_name}
                  onChange={(e) => set("category_name", e.target.value)}
                  className={input}
                />
                <datalist id="category-list">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={label}>Price *</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.price}
                  onChange={(e) => set("price", Number(e.target.value))}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Discount %</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={d.discount_percent}
                  onChange={(e) => set("discount_percent", Number(e.target.value))}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Stock *</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={d.stock}
                  onChange={(e) => set("stock", Number(e.target.value))}
                  className={input}
                />
              </div>
            </div>

            <div>
              <label className={label}>Photo</label>
              <div className="flex items-center gap-3">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-signal-500/10 text-ink-900/30">
                  <ImagePlus size={20} />
                  {d.image_url && (
                    <img
                      src={imgUrl(d.image_url)}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="inline-block cursor-pointer rounded-full border border-ink-900/10 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-900/5">
                    {uploading ? "Uploading…" : "Upload from computer"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUpload(e.target.files?.[0])}
                    />
                  </label>
                  <input
                    value={d.image_url}
                    onChange={(e) => set("image_url", e.target.value)}
                    placeholder="…or paste a direct image link (ends in .jpg / .png)"
                    className={input}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={label}>Color</label>
                <input value={d.color} onChange={(e) => set("color", e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Size</label>
                <input value={d.size} onChange={(e) => set("size", e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Delivery days</label>
                <input
                  type="number"
                  min="1"
                  value={d.delivery_days}
                  onChange={(e) => set("delivery_days", Number(e.target.value))}
                  className={input}
                />
              </div>
            </div>

            <div>
              <label className={label}>Search tags (comma separated — helps customers and Aria find it)</label>
              <input
                value={d.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="wallet, leather, gift"
                className={input}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={d.is_eco_friendly}
                onChange={(e) => set("is_eco_friendly", e.target.checked)}
              />
              Eco-friendly product
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-full px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-900/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="rounded-full bg-ink-950 px-6 py-2.5 text-sm font-medium text-white hover:bg-signal-600 disabled:opacity-50"
              >
                {saving ? "Saving…" : editing.id === null ? "Add product" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
