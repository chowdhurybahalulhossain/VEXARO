import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { useCart } from '../cart/CartContext.js';
import { formatPrice } from '../format.js';
import { WHATSAPP_NUMBER } from '../config.js';
import NotFound from './NotFound.jsx';

const MAX_PER_ORDER = 10;

const BADGE_LABELS = {
  best_selling: 'Best seller',
  new_arrival: 'New',
  offered: 'Offer',
};

// Loads the product, then hands it to ProductView.
export default function Product() {
  const { slug } = useParams();
  const { data: product, error, loading } = useApi(() => api(`/products/${slug}`), [slug]);

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading product...</p>
      </div>
    );
  }

  if (error && error.status === 404) {
    return (
      <NotFound
        title="Product not found"
        text="This product may have been removed or the link is wrong."
      />
    );
  }

  if (error) {
    return (
      <div className="page">
        <p className="notice">{error.message}</p>
      </div>
    );
  }

  // key = product id, so everything resets when you move to another product.
  return <ProductView key={product.id} product={product} />;
}

function ProductView({ product }) {
  const { addToCart } = useCart();
  const { images, variants } = product;

  const [imageIndex, setImageIndex] = useState(0);

  // Colors in the order they appear. Start on the first color that still has stock.
  const colors = [...new Set(variants.map((variant) => variant.color))];
  const firstAvailable = colors.find((item) =>
    variants.some((variant) => variant.color === item && variant.stock > 0)
  );
  const [color, setColor] = useState(firstAvailable !== undefined ? firstAvailable : colors[0]);
  const [variantId, setVariantId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });

  const sizeOptions = variants.filter((variant) => variant.color === color);
  const hasSizes = sizeOptions.some((variant) => variant.size);
  const hasColors = colors.some(Boolean);

  // The chosen variant. If a color has only one option, it is chosen automatically.
  const selected =
    sizeOptions.find((variant) => variant.id === variantId) ||
    (sizeOptions.length === 1 ? sizeOptions[0] : null);

  const soldOut = variants.length === 0 || variants.every((variant) => variant.stock === 0);
  const maxQuantity = selected ? Math.min(selected.stock, MAX_PER_ORDER) : MAX_PER_ORDER;

  const price = selected ? selected.price : product.final_price;
  const onSale = price < product.price;
  const percentOff = onSale ? Math.round((1 - price / product.price) * 100) : 0;

  const activeImage = images[imageIndex] || null;

  function chooseColor(value) {
    setColor(value);
    setVariantId(null);
    setQuantity(1);
    setStatus({ type: '', text: '' });
  }

  function chooseVariant(variant) {
    if (variant.stock === 0) return;
    setVariantId(variant.id);
    setQuantity(Math.min(quantity, Math.min(variant.stock, MAX_PER_ORDER)));
    setStatus({ type: '', text: '' });
  }

  async function handleAdd() {
    if (!selected) {
      setStatus({ type: 'error', text: hasSizes ? 'Please choose a size first.' : 'Please choose an option first.' });
      return;
    }

    setAdding(true);
    setStatus({ type: '', text: '' });
    try {
      await addToCart(selected.id, quantity);
      setStatus({ type: 'ok', text: 'Added to your cart.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setAdding(false);
    }
  }

  let whatsappLink = null;
  if (WHATSAPP_NUMBER) {
    const choice = selected ? ` (${[selected.size, selected.color].filter(Boolean).join(', ')})` : '';
    const message = `Hello VEXARO, I want to order: ${product.name}${choice} x ${quantity}\n${window.location.href}`;
    whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        {product.category_slug && (
          <>
            <Link to={`/shop?category=${product.category_slug}`}>{product.category_name}</Link>
            <span aria-hidden="true">/</span>
          </>
        )}
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="product">
        <div className="gallery">
          <div className="gallery__main">
            {activeImage ? (
              <img src={activeImage.image_url} alt={product.name} width="600" height="800" />
            ) : (
              <p className="muted">No image yet</p>
            )}
          </div>

          {images.length > 1 && (
            <div className="gallery__thumbs">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  className="gallery__thumb"
                  aria-label={`Show picture ${index + 1}`}
                  aria-current={index === imageIndex}
                  onClick={() => setImageIndex(index)}
                >
                  <img src={image.image_url} alt="" width="120" height="160" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product__info">
          {product.badge && <p className="product__badge">{BADGE_LABELS[product.badge]}</p>}
          <h1>{product.name}</h1>

          <p className="product__price">
            <span className="product__now">{formatPrice(price)}</span>
            {onSale && (
              <>
                <s className="product__was">{formatPrice(product.price)}</s>
                <span className="product__off">{percentOff}% off</span>
              </>
            )}
          </p>

          {soldOut ? (
            <p className="status status--error">This product is sold out right now.</p>
          ) : (
            <>
              {hasColors && (
                <div className="option">
                  <p className="option__label">
                    Color <span>{color}</span>
                  </p>
                  <div className="option__list">
                    {colors.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="chip"
                        aria-pressed={item === color}
                        onClick={() => chooseColor(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hasSizes && (
                <div className="option">
                  <p className="option__label">
                    Size
                    {product.size_chart_url && (
                      <a href={product.size_chart_url} target="_blank" rel="noreferrer">
                        Size chart
                      </a>
                    )}
                  </p>
                  <div className="option__list">
                    {sizeOptions.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        className="chip"
                        aria-pressed={selected !== null && selected.id === variant.id}
                        disabled={variant.stock === 0}
                        title={variant.stock === 0 ? 'Out of stock' : undefined}
                        onClick={() => chooseVariant(variant)}
                      >
                        {variant.size}
                      </button>
                    ))}
                  </div>
                  {selected && selected.stock > 0 && selected.stock <= 5 && (
                    <p className="option__hint">Only {selected.stock} left</p>
                  )}
                </div>
              )}

              <div className="option">
                <p className="option__label">Quantity</p>
                <div className="qty">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity(quantity - 1)}
                  >
                    -
                  </button>
                  <output aria-live="polite">{quantity}</output>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={quantity >= maxQuantity}
                    onClick={() => setQuantity(quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="product__actions">
                <button type="button" className="btn" disabled={adding} onClick={handleAdd}>
                  {adding ? 'Adding...' : 'Add to cart'}
                </button>
                {whatsappLink && (
                  <a className="btn btn--ghost" href={whatsappLink} target="_blank" rel="noreferrer">
                    Order on WhatsApp
                  </a>
                )}
              </div>
            </>
          )}

          <p role="status" className={`status${status.type ? ` status--${status.type}` : ''}`}>
            {status.text}
          </p>

          {product.description && <p className="product__desc">{product.description}</p>}
        </div>
      </div>
    </div>
  );
}
