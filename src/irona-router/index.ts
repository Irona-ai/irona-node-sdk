
import { logger } from "../utils/logger";
import { Base } from '../base';
const resources = '/api/v1/model-router/select-model'; // TODO: will change this to model-select in the irona-web-server repo
export class IronaRouter extends Base   {
    modelSelect(body: any): Promise<any> {
        return this.request(`${resources}`, {
            method: 'POST',
            data: body,
        });
    }
}