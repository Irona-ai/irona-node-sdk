import axios, { AxiosRequestConfig } from "axios";
import { Config } from "../types";

export abstract class Base {
  protected baseUrl: string;

  constructor(config: Config) {
    this.baseUrl = config.baseUrl as string;
  }

  protected async request<T>(
    endpoint: string,
    options?: AxiosRequestConfig
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: AxiosRequestConfig = {
      ...options,
      url,
      headers: {
        ...options?.headers,
      },
    };

    try {
      const response = await axios.request<T>(config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}
