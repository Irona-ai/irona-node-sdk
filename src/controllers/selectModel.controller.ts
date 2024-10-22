import { selectModelService } from '@/services/selectModel.service';
import { logger } from '@/utils/logger';
import { selectModelSchema } from '@/validators/selectModel.validator';
import { Request, Response, NextFunction } from 'express';

export const selectModel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('calling with body: \n'+JSON.stringify(req.body, null, 2));
    // Validate request body
    const validatedData = selectModelSchema.parse(req.body);
    // Call service to interact with third-party API
    const result = await selectModelService(validatedData);
    logger.info(result)
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error(error);
    next(error); // Pass error to middleware
  }
};
