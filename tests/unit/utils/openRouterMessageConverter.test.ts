import { buildOpenRouterUserMessages } from '../../../src/utils/openRouterMessageConverter';
import type { MessagePayload } from '../../../src/schemas/common.schema';

describe('buildOpenRouterUserMessages', () => {
  describe('message filtering', () => {
    it('skips system messages', () => {
      const messages: MessagePayload[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('skips assistant messages', () => {
      const messages: MessagePayload[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
        },
        { role: 'user', content: 'Follow-up' },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result).toHaveLength(2);
      expect(result.every(m => m.role === 'user')).toBe(true);
    });

    it('returns empty array when no user messages', () => {
      const messages: MessagePayload[] = [
        { role: 'system', content: 'System prompt' },
      ];
      expect(buildOpenRouterUserMessages(messages)).toEqual([]);
    });
  });

  describe('string content', () => {
    it('passes through string content unchanged', () => {
      const messages: MessagePayload[] = [
        { role: 'user', content: 'Hello world' },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Hello world' }]);
    });
  });

  describe('text parts', () => {
    it('converts text part correctly', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is this?' }],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        { type: 'text', text: 'What is this?' },
      ]);
    });
  });

  describe('image_url parts', () => {
    it('converts image_url part without detail', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/img.jpg' },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/img.jpg' },
        },
      ]);
    });

    it('preserves detail when present in image_url part', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/img.jpg', detail: 'high' },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/img.jpg', detail: 'high' },
        },
      ]);
    });
  });

  describe('image parts', () => {
    it('converts image part with string URL', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [{ type: 'image', image: 'https://example.com/photo.png' }],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/photo.png' },
        },
      ]);
    });

    it('converts image part with URL object', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            { type: 'image', image: new URL('https://example.com/photo.png') },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/photo.png' },
        },
      ]);
    });

    it('converts image part with Buffer to base64', () => {
      const buf = Buffer.from('fake-image-bytes');
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [{ type: 'image', image: buf }],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      const part = (
        result[0].content as Array<{ type: string; image_url: { url: string } }>
      )[0];
      expect(part.type).toBe('image_url');
      expect(part.image_url.url).toBe(buf.toString('base64'));
    });

    it('converts image part with Uint8Array to base64', () => {
      const arr = new Uint8Array([1, 2, 3, 4]);
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [{ type: 'image', image: arr }],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      const part = (
        result[0].content as Array<{ type: string; image_url: { url: string } }>
      )[0];
      expect(part.type).toBe('image_url');
      expect(part.image_url.url).toBe(Buffer.from(arr).toString('base64'));
    });
  });

  describe('file parts', () => {
    it('converts file part with HTTPS URL directly', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'https://example.com/doc.pdf',
              mediaType: 'application/pdf',
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/doc.pdf' },
        },
      ]);
    });

    it('converts file part with base64 data to data URI', () => {
      const b64 = 'JVBERi0xLjQ=';
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: b64,
              mediaType: 'application/pdf',
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: `data:application/pdf;base64,${b64}` },
        },
      ]);
    });
  });

  describe('document parts', () => {
    it('converts document part with URL source', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'url',
                url: 'https://example.com/file.pdf',
                media_type: 'application/pdf',
              },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/file.pdf' },
        },
      ]);
    });

    it('converts document part with base64 source and media type', () => {
      const b64 = 'JVBERi0xLjQ=';
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                data: b64,
                media_type: 'application/pdf',
              },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'image_url',
          image_url: { url: `data:application/pdf;base64,${b64}` },
        },
      ]);
    });

    it('defaults media_type to application/pdf when absent', () => {
      const b64 = 'JVBERi0xLjQ=';
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', data: b64 },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      const part = (
        result[0].content as Array<{ image_url: { url: string } }>
      )[0];
      expect(part.image_url.url).toBe(`data:application/pdf;base64,${b64}`);
    });
  });

  describe('video_url parts', () => {
    it('converts video_url part without filename', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'video_url',
              video_url: { url: 'https://example.com/clip.mp4' },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'video_url',
          video_url: { url: 'https://example.com/clip.mp4' },
        },
      ]);
    });

    it('preserves filename when present in video_url part', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'video_url',
              video_url: { url: 'https://example.com/clip.mp4' },
              filename: 'demo.mp4',
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'video_url',
          video_url: { url: 'https://example.com/clip.mp4' },
          filename: 'demo.mp4',
        },
      ]);
    });
  });

  describe('video parts', () => {
    it('converts video part to video_url format', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            {
              type: 'video',
              video: 'https://example.com/video.mp4',
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        {
          type: 'video_url',
          video_url: { url: 'https://example.com/video.mp4' },
        },
      ]);
    });
  });

  describe('unknown part types', () => {
    it('throws on an unknown part type', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            { type: 'unknown_type' } as unknown as Parameters<
              typeof buildOpenRouterUserMessages
            >[0][number]['content'] extends Array<infer T>
              ? T
              : never,
          ],
        },
      ];
      expect(() => buildOpenRouterUserMessages(messages)).toThrow(
        'Unsupported user message part type in OpenRouter converter: unknown_type'
      );
    });
  });

  describe('mixed content', () => {
    it('handles a message with text + video_url parts together', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this video:' },
            {
              type: 'video_url',
              video_url: { url: 'https://example.com/clip.mp4' },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toEqual([
        { type: 'text', text: 'Describe this video:' },
        {
          type: 'video_url',
          video_url: { url: 'https://example.com/clip.mp4' },
        },
      ]);
    });

    it('handles a message with text + image_url parts together', () => {
      const messages: MessagePayload[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/photo.jpg' },
            },
          ],
        },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result[0].content).toHaveLength(2);
      expect(result[0].content).toEqual([
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/photo.jpg' },
        },
      ]);
    });

    it('handles multiple user messages, skipping non-user messages', () => {
      const messages: MessagePayload[] = [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'First message' },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
        },
        { role: 'user', content: 'Second message' },
      ];
      const result = buildOpenRouterUserMessages(messages);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'First message' });
      expect(result[1]).toEqual({ role: 'user', content: 'Second message' });
    });
  });
});
