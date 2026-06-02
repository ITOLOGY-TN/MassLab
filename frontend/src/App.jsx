import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, Outlet } from 'react-router-dom';
import { apiGet } from './lib/api.js';
import { applyTheme } from './lib/theme.js';
import ScaffoldHome from './pages/ScaffoldHome.jsx';
import NutritionHome from './pages/NutritionHome.jsx';
import CalculatorsHome from './pages/calculators/CalculatorsHome.jsx';
import BmrCalculator from './pages/calculators/BmrCalculator.jsx';
import TdeeCalculator from './pages/calculators/TdeeCalculator.jsx';
import MacrosCalculator from './pages/calculators/MacrosCalculator.jsx';
import OneRepMaxCalculator from './pages/calculators/OneRepMaxCalculator.jsx';
import BodyCompositionCalculator from './pages/calculators/BodyCompositionCalculator.jsx';
import ProgramWeek from './pages/program/ProgramWeek.jsx';
import ProgramDay from './pages/program/ProgramDay.jsx';
import ExerciseDetail from './pages/program/ExerciseDetail.jsx';
import SessionJournal from './pages/journal/SessionJournal.jsx';
import SettingsLayout from './pages/settings/SettingsLayout.jsx';
import ProfileSettings from './pages/settings/ProfileSettings.jsx';
import ScheduleSettings from './pages/settings/ScheduleSettings.jsx';
import ExerciseManager from './pages/settings/ExerciseManager.jsx';
import PreferencesSettings from './pages/settings/PreferencesSettings.jsx';
import DataSettings from './pages/settings/DataSettings.jsx';

function Shell() {
  return (
    <div className="min-h-full">
      <nav className="border-b border-muted/20 px-lg py-md flex gap-lg text-sm">
        <Link to="/" className="hover:text-accent">
          Accueil
        </Link>
        <Link to="/nutrition" className="hover:text-accent">
          Nutrition
        </Link>
        <Link to="/calculators" className="hover:text-accent">
          Calculateurs
        </Link>
        <Link to="/program" className="hover:text-accent">
          Programme
        </Link>
        <Link to="/journal" className="hover:text-accent">
          Séance
        </Link>
        <Link to="/settings" className="hover:text-accent">
          Paramètres
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

export default function App() {
  // Sync the chosen theme from server prefs after first paint. The bootstrap
  // already applied the locally-cached value in main.jsx so there's no flash.
  useEffect(() => {
    apiGet('/api/v1/me/preferences')
      .then((res) => res?.data?.theme && applyTheme(res.data.theme))
      .catch(() => {
        /* offline / unauth — keep the bootstrapped theme */
      });
  }, []);

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
          <Route path="/program" element={<ProgramWeek />} />
          <Route path="/program/day/:dayOfWeek" element={<ProgramDay />} />
          <Route path="/program/exercises/:id" element={<ExerciseDetail />} />
          <Route path="/journal" element={<SessionJournal />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="schedule" element={<ScheduleSettings />} />
            <Route path="exercises" element={<ExerciseManager />} />
            <Route path="preferences" element={<PreferencesSettings />} />
            <Route path="data" element={<DataSettings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
