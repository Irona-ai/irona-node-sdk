import axios, { AxiosRequestConfig } from "axios";
import { logger } from "./utils/logger"; //using relative path so that client need to to configure its path in tsconfig.json
type Config = {
  apiKey: string;
  baseUrl?: string;
};

export abstract class Base {
  private apiKey: string;
  private baseUrl: string;


  constructor(config: Config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl as string;
  }

  protected async request<T>(endpoint: string, options?: AxiosRequestConfig): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: AxiosRequestConfig = {
      ...options,
      url,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    };
    
    try {
        logger.info(`Calling the the endpoint ${url} inside SDK `);
        return await axios(config);
    } catch (error) {
        return Promise.reject({
            "message": "some error occured",
            "statusCode": 500,
            "data": null,
            "success": false,
        });
    }
  }
}