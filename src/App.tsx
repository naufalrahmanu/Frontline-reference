import { NavLink, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home.tsx";
import { Farming } from "./pages/Farming.tsx";
import { Dolls } from "./pages/Dolls.tsx";
import { DollDetail } from "./pages/DollDetail.tsx";
import { StartHere } from "./pages/StartHere.tsx";
import { Credits } from "./pages/Credits.tsx";
import { Builder } from "./pages/Builder.tsx";
import { Presets } from "./pages/Presets.tsx";
import { NotFound } from "./pages/NotFound.tsx";

export function App() {
  return (
    <div className="shell">
      <header className="site-header">
        <div className="wrap site-header__inner">
          <NavLink to="/" className="brand">
            <span className="brand__mark">▮</span> Frontline Reference
          </NavLink>
          <nav className="site-nav" aria-label="Main">
            <NavLink to="/farming">Farming</NavLink>
            <NavLink to="/dolls">Dolls</NavLink>
            <NavLink to="/builder">Builder</NavLink>
            <NavLink to="/presets">Presets</NavLink>
            <NavLink to="/start">Start Here</NavLink>
            <NavLink to="/credits">Credits</NavLink>
          </nav>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/farming" element={<Farming />} />
          <Route path="/dolls" element={<Dolls />} />
          <Route path="/dolls/:slug" element={<DollDetail />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/presets" element={<Presets />} />
          <Route path="/start" element={<StartHere />} />
          <Route path="/credits" element={<Credits />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <div className="wrap site-footer__inner">
          <span>
            Unofficial fan reference. Not affiliated with Sunborn / MICA Team. Girls&apos;
            Frontline is their property.
          </span>
          <span>
            <NavLink to="/credits">Data sources &amp; licences</NavLink>
          </span>
        </div>
      </footer>
    </div>
  );
}
