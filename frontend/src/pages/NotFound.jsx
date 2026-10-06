import { Link } from 'react-router-dom';

// Shown for any address without a page yet (shop, product, cart ... are built in the next steps).
export default function NotFound() {
  return (
    <div className="page">
      <h1 className="page__title">This page isn't built yet</h1>
      <p className="muted">It will be added in a later step. For now you can go back to the homepage.</p>
      <p className="page__action">
        <Link to="/" className="btn btn--solid">
          Back to homepage
        </Link>
      </p>
    </div>
  );
}
