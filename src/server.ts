import express from 'express';
import dotenv from 'dotenv';
import errorMiddleware from '@/middlewares/errorMiddleware';
import { logger } from '@/utils/logger';
import routes from '@/routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/v1/model-router', routes);
app.use(errorMiddleware); // Error handling middleware

app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});
