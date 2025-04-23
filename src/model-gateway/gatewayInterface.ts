export interface GatewayConfig {
    baseUrl?: string;
    extraBody?: {
      models: string[];
      tradeoff?: 'cost' | 'quality' | 'latency';
      router_id?: string;
    };
  }
  
  export interface GatewayResponse {
    id: string;
    choices: Array<{
      index: number;
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }>;
    created: number;
    model: string;
    system_fingerprint?: string;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }