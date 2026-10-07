import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { CartProvider } from "./hooks/useCart";
import Header from "./components/Header";
import ChatWidget from "./components/ChatWidget";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import CartPage from "./pages/Cart";
import Orders from "./pages/Orders";
import Login from "./pages/Login";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <div className="flex min-h-screen flex-col bg-paper">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/products/:id" element={<ProductDetail />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/login" element={<Login />} />
                <Route path="/admin" element={<Admin />} />
              </Routes>
            </main>
            <ChatWidget />
          </div>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
