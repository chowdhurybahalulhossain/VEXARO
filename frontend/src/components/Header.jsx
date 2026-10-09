import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCategories } from '../api.js';
import { useApi } from '../hooks.js';
import { useCart } from '../cart/CartContext.js';
import Wordmark from './Wordmark.jsx';

export default function Header() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { data: categories } = useApi(getCategories, []);
  const { cart } = useCart();

  function handleSearch(event) {
    event.preventDefault();
    const text = query.trim();
    if (text) navigate(`/shop?search=${encodeURIComponent(text)}`);
  }

  return (
    <header className="site-header">
      <p className="announce">Cash on delivery available</p>

      <div className="site-header__bar">
        <Link to="/" className="wordmark" aria-label="VEXARO home">
          <Wordmark />
        </Link>

        <form className="search" role="search" onSubmit={handleSearch}>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for shirts, panjabi, kurti"
            aria-label="Search products"
          />
          <button type="submit">Search</button>
        </form>

        <nav className="account-links" aria-label="Account">
          <Link to="/login">Sign in</Link>
          <Link to="/cart" aria-label={`Cart, ${cart.item_count} items`}>
            Cart
            {cart.item_count > 0 && <span className="cart-count">{cart.item_count}</span>}
          </Link>
        </nav>
      </div>

      <nav className="category-nav" aria-label="Categories">
        {(categories || []).map((category) => (
          <Link key={category.id} to={`/shop?category=${category.slug}`}>
            {category.name}
          </Link>
        ))}
        <Link to="/shop?badge=offered">Offers</Link>
      </nav>
    </header>
  );
}
