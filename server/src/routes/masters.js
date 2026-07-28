import { Router } from 'express';
import makeCrudController from '../controllers/crudController.js';
import makeCrudRouter from './makeCrudRouter.js';
import * as partyService from '../services/party.service.js';
import * as productService from '../services/product.service.js';
import * as expenseHeadService from '../services/expenseHead.service.js';

const router = Router();

router.use('/parties', makeCrudRouter(makeCrudController(partyService)));
router.use('/products', makeCrudRouter(makeCrudController(productService)));
router.use('/expense-heads', makeCrudRouter(makeCrudController(expenseHeadService)));

export default router;
