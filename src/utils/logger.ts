import path from 'path';

import type { Logger } from 'pino';
import pino from 'pino';

export const logger: Logger =
  process.env['NODE_ENV'] === 'production'
    ? pino({
        level: 'info',
        base: null,
        formatters: {
          log: obj => {
            return {
              ...obj,
              file: getCallerFile(), // Dynamically get the file name
            };
          },
        },
      })
    : pino({
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
        level: 'debug',
        base: { env: process.env.NODE_ENV ?? 'development' },
        formatters: {
          log: obj => ({
            ...obj,
            file: getCallerFile(), // Fix file name capture
          }),
        },
      });

/**
 * Extract the caller file name dynamically.
 */
function getCallerFile(): string {
  const error = new Error();
  const stackLines = error.stack?.split('\n') ?? [];

  // Find the first line that is NOT from logger.ts
  const callerLine = stackLines.find(
    line => !line.includes('logger.ts') && line.includes('.ts')
  );

  // Extract file name from the matched line
  const match = callerLine?.match(/\((.*):\d+:\d+\)$/);
  return match ? path.basename(match[1]) : 'unknown';
}
