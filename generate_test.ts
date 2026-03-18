import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

async function generate() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API key found");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ parts: [{ text: "A cute 3D cartoon crocodile mascot named Charly, green body, orange fins, square glasses with orange rims, holding a book. White background." }] }],
  });

  const response = await model;
  const part = response.candidates[0].content.parts.find(p => p.inlineData);
  if (part && part.inlineData) {
    const buffer = Buffer.from(part.inlineData.data, 'base64');
    fs.writeFileSync(path.join(process.cwd(), "public/assets/charly_test.png"), buffer);
    console.log("Saved charly_test.png");
  } else {
    console.error("No image data found");
  }
}

generate();
