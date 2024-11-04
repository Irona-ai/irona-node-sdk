import { z, ZodError } from "zod";
import { logger } from "./logger"; // Assuming logger is in the same directory

/**
 * Validates the input data against the provided zod schema.
 * @param schema - The zod schema to validate against.
 * @param data - The data to validate.
 * @returns An object with a success flag and optional errors if validation fails.
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: any
): { success: boolean; errors?: any } {
  try {
    schema.parse(data); // This will throw if validation fails
    return { success: true }; // Validation passed
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = JSON.stringify(error.errors.map((issue: any) => ({
        message: `${issue.path.join(".")} is ${issue.message}`,
      })), null, 4);
      return {
        success: false,
        errors: errorMessages, // Return detailed validation errors
      };
    }
    // Log unexpected errors
    logger.error("Unexpected error during validation", error);
    return {
      success: false,
      errors: "Unexpected error during validation",
    };
  }
}
