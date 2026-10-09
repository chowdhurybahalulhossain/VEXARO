import { Link } from 'react-router-dom';

// Shown for addresses without a page yet, and for products that do not exist.
export default function NotFound({
  title = "This page isn't built yet",
  text = 'It will be added in a later step. For now you can go back to the homepage.',
}) {
  return (
    <div className="page">
      <h1 className="page__title">{title}</h1>
      <p className="muted">{text}</p>
      <p className="page__action">
        <Link to="/" className="btn">
          Back to homepage
        </Link>
      </p>
    </div>
  );
}
