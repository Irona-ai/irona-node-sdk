import { ToolCall } from "./functionCalling";

export function parseContent(content: string): ToolCall[] {
    if (!content || content.trim().length === 0) {
      throw new Error("Empty content received");
    }
  
    console.debug("Parsing content:", content);
  
    const strategies = [
      // Strategy 1: Parse JSON format with function_call
      (content: string) => {
        try {
          const cleaned = content.trim()
            .replace(/^[^{]*/, "")
            .replace(/[^}]*$/, "");
  
          const parsed = JSON.parse(cleaned);
          if (parsed.function_call) {
            console.debug("Found function_call:", parsed.function_call);
            return [
              {
                name: parsed.function_call.name,
                args:
                  typeof parsed.function_call.arguments === "string"
                    ? JSON.parse(parsed.function_call.arguments)
                    : parsed.function_call.arguments,
              },
            ];
          }
        } catch (e) {
          console.debug("JSON parse strategy failed:", e);
        }
        return [];
      },
  
      // Strategy 2: Function call syntax
      (content: string) => {
        const functionRegex = /(\w+)\s*\(([\s\S]*?)\)/;
        const match = content.match(functionRegex);
        if (match) {
          const [_, name, argsStr] = match;
          try {
            const args = JSON.parse(`{${argsStr}}`);
            return [{ name, args }];
          } catch {
            const args = argsStr
              .split(",")
              .map((arg) => arg.trim())
              .filter(Boolean);
            return [
              {
                name,
                args: {
                  operation: "multiply",
                  a: Number(args[0]),
                  b: Number(args[1]),
                },
              },
            ];
          }
        }
        return [];
      },
  
      // Strategy 3: XML format
      (content: string) => {
        const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/;
        const match = content.match(xmlRegex);
        if (match) {
          try {
            const cleanJson = match[1]
              .trim()
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'");
            const parsed = JSON.parse(cleanJson);
            return [
              {
                name: parsed.name,
                args:
                  typeof parsed.arguments === "string"
                    ? JSON.parse(parsed.arguments)
                    : parsed.arguments,
              },
            ];
          } catch (e) {
            console.debug("XML parse strategy failed:", e);
          }
        }
        return [];
      },
    ];
  
    for (const strategy of strategies) {
      try {
        const result = strategy(content);
        if (result.length > 0) {
          console.debug("Successfully parsed with strategy:", result);
          return result;
        }
      } catch (error) {
        console.debug("Strategy failed:", error);
      }
    }
  
    throw new Error("Could not extract valid function calls from response");
  }

// function parseArguments(args: any): Record<string, any> {
//   if (typeof args === 'string') {
//     try {
//       return JSON.parse(args);
//     } catch {
//       const values = args.split(',').map(v => v.trim());
//       return {
//         operation: 'multiply',
//         a: Number(values[0]),
//         b: Number(values[1])
//       };
//     }
//   }
//   return args || {};
// }
export function parseArguments(args: any): Record<string, any> {
    if (typeof args === "string") {
      try {
        return JSON.parse(args);
      } catch {
        const values = args.split(",").map((v) => v.trim());
        return {
          operation: "multiply",
          a: Number(values[0]),
          b: Number(values[1]),
        };
      }
    }
    return args || {};
  }
  
