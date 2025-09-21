"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSchema = validateSchema;
const zod_1 = require("zod");
/**
 * Validates the input data against the provided zod schema.
 * @param schema - The zod schema to validate against.
 * @param data - The data to validate.
 * @returns An object with a success flag and optional errors if validation fails.
 */
function validateSchema(schema, data) {
    try {
        schema.parse(data); // This will throw if validation fails
        return { success: true }; // Validation passed
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const errorMessages = JSON.stringify(error.errors.map((issue) => ({
                message: `${issue.path.length > 1
                    ? issue.path
                        .map((p, index) => (index === 0 ? p : `[${p}]`))
                        .join("")
                    : issue.path[0]}: ${issue.message}`,
            })), null, 4);
            return {
                success: false,
                errors: errorMessages, // Return detailed validation errors
            };
        }
        return {
            success: false,
            errors: "Unexpected error during validation",
        };
    }
}
