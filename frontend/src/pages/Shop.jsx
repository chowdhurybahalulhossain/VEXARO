import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getCategories } from '../api.js';
import { useApi } from '../hooks.js';
import ProductCard from '../components/ProductCard.jsx';

const LIMIT = 12;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

const FLAGS = [
  { value: 'new_arrival', label: 'New arrivals' },
  { value: 'best_selling', label: 'Best sellers' },
  { value: 'offered', label: 'Offers' },
];

function findCategory(categories, slug) {
  if (!slug) return null;
  for (const parent of categories) {
    if (parent.slug === slug) return parent;
    const child = parent.children.find((item) => item.slug === slug);
    if (child) return child;
  }
  return null;
}

// Page numbers with gaps: 1 ... 4 5 6 ... 12
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  const items = [];
  for (let number = 1; number <= totalPages; number += 1) {
    if (number === 1 || number === totalPages || Math.abs(number - page) <= 1) {
      items.push(number);
    } else if (items[items.length - 1] !== 'gap') {
      items.push('gap');
    }
  }

  return (
    <nav className="pagination" aria-label="Pages">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {items.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`}>...</span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        )
      )}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export default function Shop() {
  // Every filter lives in the address bar, e.g. /shop?category=men&sort=price_asc&page=2
  // so links can be shared and the back button works.
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const category = params.get('category') || '';
  const search = params.get('search') || '';
  const badge = params.get('badge') || '';
  const minPrice = params.get('min_price') || '';
  const maxPrice = params.get('max_price') || '';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(parseInt(params.get('page'), 10) || 1, 1);

  const { data: categories } = useApi(getCategories, []);

  const apiQuery = new URLSearchParams();
  if (category) apiQuery.set('category', category);
  if (search) apiQuery.set('search', search);
  if (badge) apiQuery.set('badge', badge);
  if (minPrice) apiQuery.set('min_price', minPrice);
  if (maxPrice) apiQuery.set('max_price', maxPrice);
  apiQuery.set('sort', sort);
  apiQuery.set('page', String(page));
  apiQuery.set('limit', String(LIMIT));
  const queryText = apiQuery.toString();

  const { data, error, loading } = useApi(() => api(`/products?${queryText}`), [queryText]);

  // Changes some filters and goes back to page 1 (unless the page itself is what changed).
  function update(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    });
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  function applyPrice(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update({
      min_price: String(form.get('min') || '').trim(),
      max_price: String(form.get('max') || '').trim(),
    });
  }

  function clearAll() {
    setParams(new URLSearchParams());
  }

  const hasFilters = Boolean(category || search || badge || minPrice || maxPrice);
  const activeCategory = findCategory(categories || [], category);
  const activeFlag = FLAGS.find((flag) => flag.value === badge);

  let title = 'All products';
  if (search) title = `Results for "${search}"`;
  else if (activeCategory) title = activeCategory.name;
  else if (activeFlag) title = activeFlag.label;

  let countText = '';
  if (data) {
    if (data.total === 0) {
      countText = '0 products';
    } else {
      const from = (data.page - 1) * data.limit + 1;
      countText = `Showing ${from}-${from + data.products.length - 1} of ${data.total}`;
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">{title}</h1>

      <div className="shop">
        <button
          type="button"
          className="btn btn--ghost filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="shop-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          {filtersOpen ? 'Hide filters' : 'Filters'}
        </button>

        <aside
          id="shop-filters"
          className={`filters${filtersOpen ? ' filters--open' : ''}`}
          aria-label="Filters"
        >
          <div className="filter-group">
            <h2>Category</h2>
            <ul className="filter-list">
              <li>
                <button
                  type="button"
                  className="filter-link"
                  aria-current={!category}
                  onClick={() => update({ category: '' })}
                >
                  All products
                </button>
              </li>
              {(categories || []).map((parent) => {
                const open =
                  parent.slug === category || parent.children.some((child) => child.slug === category);
                return (
                  <li key={parent.id}>
                    <button
                      type="button"
                      className="filter-link"
                      aria-current={parent.slug === category}
                      onClick={() => update({ category: parent.slug })}
                    >
                      {parent.name}
                    </button>
                    {open && parent.children.length > 0 && (
                      <ul className="filter-list filter-sub">
                        {parent.children.map((child) => (
                          <li key={child.id}>
                            <button
                              type="button"
                              className="filter-link"
                              aria-current={child.slug === category}
                              onClick={() => update({ category: child.slug })}
                            >
                              {child.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="filter-group">
            <h2>Price (৳)</h2>
            {/* The key makes the boxes refill when the address bar changes (for example after Clear). */}
            <form className="price-form" key={`${minPrice}-${maxPrice}`} onSubmit={applyPrice}>
              <input
                type="number"
                name="min"
                min="0"
                placeholder="Min"
                aria-label="Minimum price"
                defaultValue={minPrice}
              />
              <input
                type="number"
                name="max"
                min="0"
                placeholder="Max"
                aria-label="Maximum price"
                defaultValue={maxPrice}
              />
              <button type="submit" className="btn">
                Apply
              </button>
            </form>
          </div>

          <div className="filter-group">
            <h2>Show</h2>
            <ul className="filter-list">
              <li>
                <button
                  type="button"
                  className="filter-link"
                  aria-current={!badge}
                  onClick={() => update({ badge: '' })}
                >
                  Everything
                </button>
              </li>
              {FLAGS.map((flag) => (
                <li key={flag.value}>
                  <button
                    type="button"
                    className="filter-link"
                    aria-current={badge === flag.value}
                    onClick={() => update({ badge: flag.value })}
                  >
                    {flag.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {hasFilters && (
            <button type="button" className="link-button" onClick={clearAll}>
              Clear all filters
            </button>
          )}
        </aside>

        <section aria-label="Products">
          <div className="shop__bar">
            <p className="shop__count">{countText}</p>
            <label className="shop__controls">
              Sort by
              <select
                className="select"
                value={sort}
                onChange={(event) => update({ sort: event.target.value })}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading && !data && <p className="muted">Loading products...</p>}

          {error && (
            <p className="notice">
              Could not load products. {error.message} (Start it with <code>npm run dev</code> in the
              backend folder.)
            </p>
          )}

          {data && data.products.length === 0 && (
            <div className="empty">
              <p>No products match these filters.</p>
              {hasFilters && (
                <button type="button" className="btn" onClick={clearAll}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {data && data.products.length > 0 && (
            <div className="grid">
              {data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {data && (
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              onChange={(number) => update({ page: number })}
            />
          )}
        </section>
      </div>
    </div>
  );
}
