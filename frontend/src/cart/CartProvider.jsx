import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { CartContext } from './CartContext.js';

const EMPTY_CART = { items: [], item_count: 0, subtotal: 0 };

// Wrap the whole app in this once (see main.jsx).
// Every action asks the backend and then stores the fresh cart it sends back.
export default function CartProvider({ children }) {
  const [cart, setCart] = useState(EMPTY_CART);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setCart(await api('/cart'));
    } catch (err) {
      // If the backend is down the shop pages show their own message; keep the cart empty here.
      setCart(EMPTY_CART);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      cart,
      loading,
      refresh,
      // These throw an Error with a readable message (for example "Not enough stock").
      async addToCart(variantId, quantity = 1) {
        const updated = await api('/cart', { method: 'POST', body: { variant_id: variantId, quantity } });
        setCart(updated);
        return updated;
      },
      async updateItem(itemId, quantity) {
        const updated = await api(`/cart/${itemId}`, { method: 'PATCH', body: { quantity } });
        setCart(updated);
        return updated;
      },
      async removeItem(itemId) {
        const updated = await api(`/cart/${itemId}`, { method: 'DELETE' });
        setCart(updated);
        return updated;
      },
    }),
    [cart, loading, refresh]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
