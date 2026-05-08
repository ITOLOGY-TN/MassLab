import { BrowserRouter, Routes, Route, Link, Outlet } from 'react-router-dom';
import ScaffoldHome from './pages/ScaffoldHome.jsx';
import NutritionHome from './pages/NutritionHome.jsx';
import CalculatorsHome from './pages/calculators/CalculatorsHome.jsx';
import BmrCalculator from './pages/calculators/BmrCalculator.jsx';
import TdeeCalculator from './pages/calculators/TdeeCalculator.jsx';
import MacrosCalculator from './pages/calculators/MacrosCalculator.jsx';
import OneRepMaxCalculator from './pages/calculators/OneRepMaxCalculator.jsx';
import BodyCompositionCalculator from './pages/calculators/BodyCompositionCalculator.jsx';

function Shell() {
  return (
    <div className="min-h-full">
      <nav className="border-b border-muted/20 px-lg py-md flex gap-lg text-sm">
        <Link to="/" className="hover:text-accent">Accueil</Link>
        <Link to="/nutrition" className="hover:text-accent">Nutrition</Link>
        <Link to="/calculators" className="hover:text-accent">Calculateurs</Link>
      </nav>
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<ScaffoldHome />} />
          <Route path="/nutrition" element={<NutritionHome />} />
          <Route path="/calculators" element={<CalculatorsHome />} />
          <Route path="/calculators/bmr" element={<BmrCalculator />} />
          <Route path="/calculators/tdee" element={<TdeeCalculator />} />
          <Route path="/calculators/macros" element={<MacrosCalculator />} />
          <Route path="/calculators/one-rep-max" element={<OneRepMaxCalculator />} />
          <Route path="/calculators/body-composition" element={<BodyCompositionCalculator />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
