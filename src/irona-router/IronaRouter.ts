import { Base } from "./base";
import { validateSchema } from "../utils/requestValidator";
import { modelSelectSchema } from "../validators/modelSelect.validator";
const resources = "/api/v1/model-router/select-model"; // TODO: will change this to model-select in the irona-web-server repo
export class IronaRouter extends Base {
  modelSelect(body: any): Promise<any> {
    const validationResult = validateSchema(modelSelectSchema, body);
    if (!validationResult.success) {
      return Promise.reject({
        success: false,
        message: "Validation failed",
        details: validationResult.errors, // Return validation errors
      });
    }

    return this.request(`${resources}`, {
      method: "POST",
      data: body,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
      },
    });
  }
}
