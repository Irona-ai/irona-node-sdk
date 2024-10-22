declare type message = {
    role: string,
    content: string
}
declare type llm_provider = {
    provider: string,
    model: string
}

export declare type SelectModelBody = {
  messages: message[],
  llm_providers: llm_provider[]
};