import { Link } from 'react-router-dom';
import Wordmark from './Wordmark.jsx';

export default function Footer() {
  return (
    <>
      <div className="hazard" aria-hidden="true" />
      <footer className="site-footer">
        <div className="site-footer__inner">
          <p className="wordmark wordmark--small">
            <Wordmark />
          </p>

          <nav className="site-footer__links" aria-label="Help">
            <Link to="/track">Track your order</Link>
            <Link to="/contact">Contact us</Link>
          </nav>

          <p className="site-footer__copy">© {new Date().getFullYear()} VEXARO</p>
        </div>
      </footer>
    </>
  );
}
