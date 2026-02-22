
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

// Load .env manually
try {
    const envPath = path.resolve(process.cwd(), '.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value && !key.startsWith('#')) {
            process.env[key.trim()] = value.trim();
        }
    });
} catch (e) {
    console.log("Could not load .env file", e);
}

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("GEMINI_API_KEY is not set.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function testVision() {
    try {
        console.log("Testing models/gemini-2.5-pro...");
        const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-pro" });

        const imagePath = "/Users/brindha/.gemini/antigravity/brain/4ca4e9d7-2f69-44b7-a3bc-bd36f4e2621e/uploaded_image_1767630212392.png";

        if (!fs.existsSync(imagePath)) {
            console.error("Image file not found at " + imagePath);
            // Try to find any png in the directory if that specific one is gone
            return;
        }

        const imageData = fs.readFileSync(imagePath);
        const base64Data = imageData.toString('base64');

        const result = await model.generateContent([
            "Describe this medical image in detail.",
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/png",
                },
            },
        ]);

        console.log("Response:");
        console.log(result.response.text());

    } catch (error) {
        console.error("Error testing vision model:", error);
    }
}

testVision();
