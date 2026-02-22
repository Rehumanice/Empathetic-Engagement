
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

async function listModels() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const errText = await response.text();
            console.error(errText);
            return;
        }

        const data = await response.json();

        console.log("Available Models:");
        if (data.models) {
            data.models.forEach(model => {
                console.log(`- ${model.name} (${model.supportedGenerationMethods.join(', ')})`);
            });
        } else {
            console.log("No models found or error structure:", data);
        }

    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
