import { Link } from 'react-router-dom';
import { getCategories } from '../api.js';
import { useApi } from '../hooks.js';
import ProductRow from '../components/ProductRow.jsx';
import Wordmark from '../components/Wordmark.jsx';

export default function Home() {
  const { data: categories } = useApi(getCategories, []);

  // The two first main categories (Men, Women) become the big buttons.
  const mainCategories = (categories || []).slice(0, 2);

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <h1 className="hero__mark" aria-label="VEXARO">
            <Wordmark />
          </h1>
          <p className="hero__line">
            Clothing for men, women and kids, delivered across Bangladesh.
          </p>
          <div className="hero__actions">
            {mainCategories.map((category) => (
              <Link key={category.id} to={`/shop?category=${category.slug}`} className="btn">
                Shop {category.name.toLowerCase()}
              </Link>
            ))}
            <Link to="/shop" className="btn btn--ghost">
              Browse everything
            </Link>
          </div>
        </div>
      </section>

      <div className="hazard" aria-hidden="true" />

      <div className="page">
        <ProductRow
          title="New arrivals"
          query="badge=new_arrival&limit=8"
          seeAllTo="/shop?badge=new_arrival"
        />
        <ProductRow
          title="Best sellers"
          query="badge=best_selling&limit=8"
          seeAllTo="/shop?badge=best_selling"
        />
        <ProductRow title="Latest products" query="sort=newest&limit=8" seeAllTo="/shop" />
      </div>
    </>
  );
}
