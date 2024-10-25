// /

// type Config = {
//   apiKey: string;
//   baseUrl?: string;
// };
// export class IronaAICompletion {
//   private apiKey: string;

//   constructor(config: Config) {
//     this.apiKey = config.apiKey;
//   }
//   public chat = {
//     completions: {
//       acreate: async (input: any) => await this.complete(input),
//     },
//   };

//   private getAdapter(model: string): CompletionAdapter {
//     switch (model) {
//       case "gpt-4o-mini":
//       case "gpt-3.5-turbo":
//       case "gpt-4": // Add any other OpenAI models
//         return new OpenAIAdapter(this.apiKey);

//       case 'claude-3-5-sonnet-20241022':
//           return new AnthropicAIAdapter(this.apiKey);
//       case "together":
//       case "meta-llama/Llama-Vision-Free":
//         return new TogetherAIAdapter(this.apiKey);
//       default:
//         throw new Error(`No adapter found for model: ${model}`);
//     }
//   }
//   private async complete(input: any): Promise<any> {
//     const adapter = this.getAdapter(input.model);
//     return await adapter.complete(input);
//   }
// }