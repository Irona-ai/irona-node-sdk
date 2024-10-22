import { logger } from '@/utils/logger';
import { Request, Response, NextFunction } from 'express';

const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`Error: ${message}, StatusCode: ${statusCode}`);

  res.status(statusCode).json({
    success: false,
    message,
  });
};

export default errorMiddleware;
