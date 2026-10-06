import { Outlet, Route, Routes } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';

// Header and footer stay on every page; <Outlet /> is where the current page appears.
function Layout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        {/* Next steps add: /shop, /product/:slug, /cart, /checkout, /track, /login */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
