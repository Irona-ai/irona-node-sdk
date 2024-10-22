import { Request, Response, NextFunction } from 'express';
import { stat } from 'fs';
import { z, ZodError } from 'zod';

export function validateRequest(schemas: { body?: z.ZodTypeAny; params?: z.ZodTypeAny }) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessages = error.errors.map((issue: any) => ({
                    message: `${issue.path.join('.')} is ${issue.message}`,
                }));
                const apiResponse = {
                    message: 'Invalid input',
                    data: errorMessages,
                    statusCode: 400
                };
                res.status(apiResponse.statusCode).json(apiResponse);
            } else {
                res.status(500).json({
                    error: 'Internal Server Error',
                });
            }
        }
    };
}
