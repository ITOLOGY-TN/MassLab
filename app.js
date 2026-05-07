import express from 'express';
import cors from 'cors';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, HttpError } from './middleware/errorHandler.js';
import { buildAuthMiddleware } from './middleware/auth.js';
import { athletesDao } from './services/dataAccess/athletes.dao.js';
import { exercisesDao } from './services/dataAccess/exercises.dao.js';
import { weeklyPlanDao } from './services/dataAccess/weeklyPlan.dao.js';
import { trainingPhasesDao } from './services/dataAccess/trainingPhases.dao.js';
import { nutritionDao } from './services/dataAccess/nutrition.dao.js';
import { supplementsDao } from './services/dataAccess/supplements.dao.js';
import { foodsDao } from './services/dataAccess/foods.dao.js';
import { quotesDao } from './services/dataAccess/quotes.dao.js';
import { getSupabase } from './services/dataAccess/supabaseClient.js';
import { athleteRoutes } from './routes/athlete.routes.js';
import { exercisesRoutes } from './routes/exercises.routes.js';
import { weeklyPlanRoutes } from './routes/weeklyPlan.routes.js';
import { trainingPhasesRoutes } from './routes/trainingPhases.routes.js';
import { nutritionRoutes } from './routes/nutrition.routes.js';
import { supplementsRoutes } from './routes/supplements.routes.js';
import { foodsRoutes } from './routes/foods.routes.js';
import { quotesRoutes } from './routes/quotes.routes.js';

export function buildApp({ config, supabase, daos } = {}) {
  const sb = supabase ?? getSupabase(config);
  const resolved = daos ?? {
    athletes: athletesDao(sb),
    exercises: exercisesDao(sb),
    weeklyPlan: weeklyPlanDao(sb),
    trainingPhases: trainingPhasesDao(sb),
    nutrition: nutritionDao(sb),
    supplements: supplementsDao(sb),
    foods: foodsDao(sb),
    quotes: quotesDao(sb),
  };

  const app = express();
  app.disable('x-powered-by');
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(requestId);
  app.use(requestLogger);
  app.use(buildAuthMiddleware({ config, supabase: sb, athletesDao: resolved.athletes }));

  const v1 = express.Router();
  v1.use('/athlete', athleteRoutes(resolved.athletes));
  v1.use('/exercises', exercisesRoutes(resolved.exercises));
  v1.use('/weekly-plan', weeklyPlanRoutes(resolved.weeklyPlan));
  v1.use('/training-phases', trainingPhasesRoutes(resolved.trainingPhases));
  v1.use('/nutrition', nutritionRoutes(resolved.nutrition));
  v1.use('/supplements', supplementsRoutes(resolved.supplements));
  v1.use('/foods', foodsRoutes(resolved.foods));
  v1.use('/quotes', quotesRoutes(resolved.quotes));
  app.use('/api/v1', v1);

  app.use((req, _res, next) => {
    next(new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
  });
  app.use(errorHandler);

  return app;
}
