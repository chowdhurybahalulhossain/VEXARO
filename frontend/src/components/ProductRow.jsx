import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import ProductCard from './ProductCard.jsx';

// A titled grid of products.
//   <ProductRow title="New arrivals" query="badge=new_arrival&limit=8" seeAllTo="/shop?badge=new_arrival" />
// `query` is the same text you would put after /api/products? in the browser.
export default function ProductRow({ title, query, seeAllTo }) {
  const { data, error, loading } = useApi(() => api(`/products?${query}`), [query]);

  if (loading) {
    return (
      <section className="row">
        <h2>{title}</h2>
        <p className="muted">Loading products...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="row">
        <h2>{title}</h2>
        <p className="notice">
          Could not load products. {error.message} (Start it with <code>npm run dev</code> in the
          backend folder.)
        </p>
      </section>
    );
  }

  // Nothing to show: leave the whole section out instead of showing an empty heading.
  if (data.products.length === 0) return null;

  return (
    <section className="row">
      <div className="row__head">
        <h2>{title}</h2>
        <Link to={seeAllTo}>See all</Link>
      </div>
      <div className="grid">
        {data.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
