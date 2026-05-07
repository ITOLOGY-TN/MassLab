import { Router } from 'express';
import { supplementsController } from '../controllers/supplements.controller.js';

export function supplementsRoutes(supplementsDao) {
  const r = Router();
  const c = supplementsController(supplementsDao);
  r.get('/', c.list);
  return r;
}
