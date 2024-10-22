import { modelSelectService } from "@/services/modelSelect.service";
import { logger } from "@/utils/logger";
import { modelSelectSchema } from "@/validators/modelSelect.validator";
import { Request, Response, NextFunction } from "express";

export const modelSelect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    logger.info("calling with body: \n" + JSON.stringify(req.body, null, 2));
    // Validate request body
    const validatedData = modelSelectSchema.parse(req.body);
    // Call service to interact with third-party API
    const result = await modelSelectService(validatedData);
    logger.info(result);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    logger.error(error);
    next(error); // Pass error to middleware
  }
};
