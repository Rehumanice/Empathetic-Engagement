export const prerender = false;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../../lib/supabase";

export const POST = async ({ request }) => {
    try {
        const body = await request.json();
        console.log("Regenerate API Payload:", body); // DEBUG
        const { reportId, diet, cuisine } = body;

        if (!reportId || !diet || !cuisine) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }

        const apiKey = import.meta.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Server Error: GEMINI_API_KEY not configured" }), { status: 500 });
        }

        // 1. Fetch existing report to get context
        const { data: report, error: fetchError } = await supabase
            .schema("medicalai")
            .from("reports")
            .select("*")
            .eq("id", reportId)
            .single();

        if (fetchError || !report) {
            return new Response(JSON.stringify({ error: "Report not found" }), { status: 404 });
        }

        const fullJson = report.full_analysis_json;
        // Construct context from existing summary/diagnosis
        const clinicalContext = JSON.stringify({
            diagnosis: fullJson.diagnosis || fullJson.patient_summary,
            abnormalities: fullJson.deviation_from_normal || fullJson.panels?.flatMap(p => p.tests.filter(t => t.flag !== 'success')) || [],
            summary: fullJson.doctor_summary || fullJson.summary
        });

        // 2. Generate NEW Dietary Plan
        const genAI = new GoogleGenerativeAI(apiKey);
        // Using MedGemma (Gemma 3 27B IT) for dietary regeneration
        const model = genAI.getGenerativeModel({ model: "models/gemma-3-27b-it" });

        const prompt = `
            You are **MedGemma**, an expert Medical Nutritionist AI.
            
            PATIENT CONTEXT:
            ${clinicalContext}

            USER REQUEST (CRITICAL):
            The patient strictly follows a **${diet}** diet and prefers **${cuisine}** cuisine.
            
            **INSTRUCTION:**
            You MUST ignore any previous generic dietary advice. 
            Generate a completely new dietary plan tailored **exclusively** to **${cuisine}** ingredients and recipes.
            For example, if "South Indian", suggest Idli, Dosa, Sambar, Poriyal. 
            If "Mediterranean", suggest Hummus, Olive Oil, Greek Salad.
            
            Do NOT provide generic "Oatmeal" or "Salmon" unless it fits the specific cuisine requested.

            TASK:
            Generate a detailed dietary plan object tailored to the patient's medical condition AND their specific diet/cuisine preferences.

            OUTPUT JSON Structure (Return ONLY this object):
            {
                "diet_preference": "${diet}",
                "cuisine_preference": "${cuisine}",
                "title": "Diet Name (e.g. 'South Indian Diabetic Diet')",
                "description": "Specific overview of why this diet helps with the identified issues.",
                "macronutrients": { "protein": "X%", "carbs": "X%", "fats": "X%" },
                "meal_plan": {
                    "breakfast": ["${cuisine} option 1", "${cuisine} option 2"],
                    "lunch": ["${cuisine} option 1"],
                    "dinner": ["${cuisine} option 1"],
                    "snacks": ["${cuisine} option 1"]
                },
                "lifestyle_tips": ["Tip 1", "Tip 2"],
                "allowed": ["${cuisine} Food 1", "${cuisine} Food 2"],
                "avoid": ["Food 1", "Food 2"],
                "hydration": "Advice"
            }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const aiJson = JSON.parse(cleanedText);

        console.log("AI Raw Output:", JSON.stringify(aiJson, null, 2)); // DEBUG raw AI response

        // FORCE inject the requested preferences to ensure UI labels always show
        const newDietPlan = {
            ...aiJson,
            diet_preference: diet,
            cuisine_preference: cuisine
        };

        // 3. Update Supabase
        fullJson.dietary_plan = newDietPlan;

        const { error: updateError } = await supabase
            .schema("medicalai")
            .from("reports")
            .update({ full_analysis_json: fullJson })
            .eq("id", reportId);

        if (updateError) {
            throw updateError;
        }

        return new Response(JSON.stringify(newDietPlan), { status: 200 });

    } catch (error) {
        console.error("Regenerate Diet Error:", error);
        return new Response(JSON.stringify({ error: "Failed to regenerate diet", details: error.message }), { status: 500 });
    }
};
