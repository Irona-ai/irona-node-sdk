"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Base = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger"); //using relative path so that client need to to configure its path in tsconfig.json
class Base {
    apiKey;
    baseUrl;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl;
    }
    async request(endpoint, options) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            ...options,
            url,
            headers: {
                ...options?.headers,
            },
        };
        try {
            logger_1.logger.info(`Calling the the endpoint ${url} inside SDK `);
            return await (0, axios_1.default)(config);
        }
        catch (error) {
            return Promise.reject({
                message: "Some error occured",
                statusCode: 500,
                data: error,
                success: false,
            });
        }
    }
}
exports.Base = Base;
