
const apiKey = process.env.GEMINI_API_KEY;
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        const models = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).apiKey; // Hack to get client, actually usually we use axios or just try-catch loop
        // SDK doesn't have a direct listModels on the main instance in some versions?
        // Let's use raw fetch for certainty.

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => {
                if (m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`- ${m.name}`);
                }
            });
        } else {
            console.error("No models found:", data);
        }
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
