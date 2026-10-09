import { createContext, useContext } from 'react';

// Holds the shopping cart so the header, product pages and the cart page all see the same data.
export const CartContext = createContext(null);

// In any component:  const { cart, addToCart } = useCart();
//   cart.items       the lines in the cart
//   cart.item_count  total number of pieces (shown next to "Cart" in the header)
//   cart.subtotal    total price of the cart
export function useCart() {
  const value = useContext(CartContext);
  if (!value) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return value;
}
