"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Base = void 0;
const axios_1 = __importDefault(require("axios"));
class Base {
    baseUrl;
    constructor(config) {
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
            const response = await axios_1.default.request(config);
            return response.data;
        }
        catch (error) {
            throw error;
        }
    }
}
exports.Base = Base;
