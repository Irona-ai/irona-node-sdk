import type { MessagePayload } from '../schemas/common.schema';

export function normalizeMessageContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/, '');
}

export function normalizeMessagesForCache(
  messages: MessagePayload[]
): MessagePayload[] {
  return messages.map(msg => {
    if (msg.role === 'system') {
      return { role: 'system', content: normalizeMessageContent(msg.content) };
    }
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        return { role: 'user', content: normalizeMessageContent(msg.content) };
      }
      return {
        role: 'user',
        content: msg.content.map(part =>
          part.type === 'text'
            ? { ...part, text: normalizeMessageContent(part.text) }
            : part
        ),
      };
    }
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        return {
          role: 'assistant',
          content: normalizeMessageContent(msg.content),
        };
      }
      return {
        role: 'assistant',
        content: msg.content.map(part =>
          part.type === 'text'
            ? { ...part, text: normalizeMessageContent(part.text) }
            : part
        ),
      };
    }
    // tool messages have structured array content — leave unchanged
    return msg;
  });
}
