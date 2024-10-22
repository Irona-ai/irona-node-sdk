import { selectModel } from '@/controllers/selectModel.controller';
import { validateRequest } from '@/middlewares/requestValidator';
import { selectModelSchema } from '@/validators/selectModel.validator';
import { Router } from 'express';

const router = Router();

router.post('/select-model',validateRequest({body: selectModelSchema}), selectModel);

export default router;
