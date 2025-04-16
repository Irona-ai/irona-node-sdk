import { MEDIA_TYPE } from "../constants/common.constants";
import { MessagePayload } from "../schemas/common.schema";

export function containsDocumentInMessages(
  messages: MessagePayload[]
): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((item) => item.type === MEDIA_TYPE.DOCUMENT)
  );
}
export function containsImageUrlInMessages(
  messages: MessagePayload[]
): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((item) => item.type === MEDIA_TYPE.IMAGE_URL)
  );
}

export function extractProviderAndModel(modelPayload: string): {
  provider: string;
  model: string;
} {
  const [provider, ...modelParts] = modelPayload.split("/");
  const model = modelParts.join("/");
  return { provider, model };
}
