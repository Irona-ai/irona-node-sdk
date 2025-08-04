const { IronaAI } = require("ironaai");
const fs = require("fs");
const path = require("path");

const commonImageBody = {
  prompt: "A beautiful sunset over mountains with vibrant colors",
  models: [
    "openai/dall-e-3",
    "openai/dall-e-2", 
    "vertex/imagen-4.0-generate-preview-06-06",
    "vertex/imagen-4.0-ultra-generate-preview-06-06",
    "vertex/imagen-3.0-generate-002"
  ],
  fallback_models: ["openai/gpt-image-1"],
};

async function modelSelectImageTest() {
  let body = {
    ...commonImageBody,
    messages: [{ role: "user", content: commonImageBody.prompt }]
  }
  const sdkClient = await IronaAI.createInstance();
  try {
    // Select a model for image generation
    const modelResponse = await sdkClient.modelSelect({...body, topk_models: 2});
    console.info("[imageGenerationExample] Model selected:" + JSON.stringify(modelResponse));
  } catch (error) {
    console.log("[imageGenerationExample] Error in SDK selectModel usage:\n");
    console.error("[imageGenerationExample]", error);
  }
}

async function imageGenerationTest() {
  let body = {
    ...commonImageBody,
    maxRetries: 2,
    temperature: 0.8,
  };
  const sdkClient = await IronaAI.createInstance({
    fallback_models: ["openai/dall-e-3", "google/imagen-3.0-generate-002", "openai/dall-e-2", "openai/gpt-image-1"],
  });
  try {
    const { provider, model, response, prompt, error } = await sdkClient.images.generate(body);
    console.log(`[imageGenerationExample] Selected provider: ${provider}, model: ${model}, prompt: ${prompt}\n`);
    console.log(`[imageGenerationExample] Response type: ${response.type}\n`);
    console.log(`[imageGenerationExample] Response content: ${JSON.stringify(response.content, null, 2)}\n`);
    console.log("[imageGenerationExample] error: " + error);

    // Save the generated image
    if (response && response.content) {
      const image = response.content;
      
      // Create output directory
      const outputDir = path.join(__dirname, "generated_images");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log("[imageGenerationExample] 🖼️ Generated Image Details:");
      console.log(`[imageGenerationExample]   Type: ${typeof image}`);
      console.log(`[imageGenerationExample]   Keys: ${Object.keys(image).join(', ')}`);
      
      if (image.base64Data) {
        console.log("[imageGenerationExample] 📸 Converting base64 image to PNG file...");
        const base64Data = image.base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
        const filename = path.join(outputDir, `generated_image_${Date.now()}.png`);
        fs.writeFileSync(filename, Buffer.from(base64Data, 'base64'));
        console.log(`[imageGenerationExample] 💾 Image saved successfully as: ${filename}`);
        console.log(`[imageGenerationExample] 📁 You can now open the saved image!`);
        console.log(`[imageGenerationExample] 📂 Full path: ${path.resolve(filename)}`);
      } else if (image.url) {
        console.log(`[imageGenerationExample] 📸 Image (URL): ${image.url}`);
        console.log("[imageGenerationExample] 🔗 Image is available at the URL above");
      } else if (image.data) {
        console.log("[imageGenerationExample] 📸 Saving binary image data...");
        const filename = path.join(outputDir, `generated_image_${Date.now()}.png`);
        fs.writeFileSync(filename, image.data);
        console.log(`[imageGenerationExample] 💾 Image saved successfully as: ${filename}`);
      } else {
        console.log("[imageGenerationExample] ❌ Unknown image format:", image);
      }
    } else {
      console.log("[imageGenerationExample] ❌ No image returned");
    }
  } catch (error) {
    console.log("[imageGenerationExample] Error in SDK Image Generation usage:\n");
    console.error("[imageGenerationExample]", error);
  }
}

modelSelectImageTest();
imageGenerationTest(); 