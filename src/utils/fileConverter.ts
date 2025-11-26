/**
 * Utility functions for converting file URLs to base64 data URLs
 * Required for OpenAI API which doesn't accept direct URLs for PDFs
 */

/**
 * Fetches a file from a URL and converts it to a base64 data URL
 * @param url - The URL of the file to fetch
 * @param mediaType - The MIME type of the file
 * @returns A base64 data URL
 */
export async function fetchAndConvertToBase64(
  url: string,
  mediaType: string
): Promise<string> {
  try {
    // If it's already a data URL, return as-is
    if (url.startsWith('data:')) {
      return url;
    }

    // Fetch the file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }

    // Convert to buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to base64
    const base64 = buffer.toString('base64');

    // Return as data URL
    return `data:${mediaType};base64,${base64}`;
  } catch (error) {
    console.error(`Error converting URL to base64: ${url}`, error);
    throw new Error(`Failed to convert file to base64: ${error}`);
  }
}

/**
 * Checks if a provider requires base64 conversion for file attachments
 * @param provider - The AI provider name
 * @returns True if the provider requires base64 conversion
 */
export function requiresBase64Conversion(provider: string): boolean {
  // OpenAI requires base64 for PDF files
  // Other providers like Anthropic can handle URLs directly
  return provider === 'openai';
}