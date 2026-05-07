import { Router } from 'express';
import { quotesController } from '../controllers/quotes.controller.js';

export function quotesRoutes(quotesDao) {
  const r = Router();
  const c = quotesController(quotesDao);
  r.get('/', c.list);
  r.get('/today', c.getToday);
  return r;
}
