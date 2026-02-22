export const prerender = false;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../../lib/supabase";

import { Buffer } from 'node:buffer';

export const POST = async ({ request }) => {
  console.log("Analyze Blood API called (MedGemma Edition). Method:", request.method);

  let data;
  try {
    data = await request.formData();
  } catch (e) {
    console.error("Error parsing FormData (likely too large):", e);
    return new Response(JSON.stringify({ error: "Request too large or invalid", details: e.message }), { status: 413 });
  }

  const files = data.getAll("file");
  console.log(`Received ${files.length} files.`);

  if (!files || files.length === 0) {
    return new Response(JSON.stringify({ error: "No files uploaded" }), { status: 400 });
  }

  const apiKey = import.meta.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server Error: GEMINI_API_KEY not configured" }), { status: 500 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // --- STAGE 1: RAW DATA EXTRACTION (Vision) ---
    // Use Gemini 2.5 Pro for best-in-class OCR and medical data extraction
    const visionModel = genAI.getGenerativeModel({ model: "models/gemini-2.5-pro" });

    // Process all files
    const fileParts = await Promise.all(
      files.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");
        return {
          inlineData: {
            data: base64Data,
            mimeType: file.type,
          },
        };
      })
    );

    console.log("Stage 1: Running Vision Extraction (Gemini 2.5 Pro)...");

    const visionPrompt = `
          You are an expert Medical AI Assistant.
          Extract ALL data from the provided blood test report(s) with 100% accuracy.
          
          Return a raw detailed JSON object containing:
          1. "patient_details": Name, Age, Gender, Date (if available).
          2. "tests": An array of ALL test results found. For each test:
             - "name": Test Name (exact string from report)
             - "value": Numeric value or string result
             - "unit": Unit (e.g., mg/dL)
             - "range": Reference range string
             - "is_abnormal": boolean (based on range)
          
          Return ONLY valid JSON. Do not interpret yet, just extract.
        `;

    const visionResult = await visionModel.generateContent([visionPrompt, ...fileParts]);
    const visionText = visionResult.response.text();
    const cleanedVisionText = visionText.replace(/```json/g, "").replace(/```/g, "").trim();

    // --- STAGE 2: MEDGEMMA SYNTHESIS (Gemma 3) ---
    console.log("Stage 2: Running MedGemma Synthesis (Gemma 3 27B IT)...");

    // Use Gemma 3 27B IT for the "MedGemma" persona and synthesis
    const medGemmaModel = genAI.getGenerativeModel({ model: "models/gemma-3-27b-it" });

    const dietPref = data.get("diet") || "Balanced";
    const cuisinePref = data.get("cuisine") || "International";

    const synthesisPrompt = `
          You are **MedGemma** (Medical Generative Multi-modal Assistant).
          
          INPUT DATA (Extracted from Reports):
          ${cleanedVisionText}

          YOUR TASK:
          Synthesize this data into a highly detailed, professional, and comforting Patient Report.

          **CRITICAL DIETARY INSTRUCTION:**
          The patient follows a **${dietPref}** diet and prefers **${cuisinePref}** cuisine. 
          You MUST tailor the 'dietary_plan' (meal examples, recipes, food choices) strictly to this cuisine and diet type.

          Structure your response as this JSON:
          {
            "healthScore": Number 0-100 (calculate based on abnormal tests),
            "patient_summary": "A detailed professional summary (4-5 sentences) explaining the health status clearly to the patient.",
            "doctor_summary": "A highly technical clinical summary for a medical professional.",
            "clinical_correlations": ["Array of potential clinical correlations linking disparate findings (e.g. Elevated Glucose + High Triglycerides indicating Metabolic Syndrome)."],
            "summary_tamil": "MANDATORY. A summary using Tamil script (தமிழ்) for conversational words, but keep medical terms in English.",
            
            "panels": [
              {
                "title": "Panel Name (e.g. Lipid Profile)",
                "description": "What this panel checks",
                "tests": [
                  {
                    "name": "Test Name",
                    "value": "Value",
                    "unit": "Unit",
                    "range": "Ref Range",
                    "status": "Normal | High | Low | Critical",
                    "flag": "success | warning | error",
                    "explanation": "Simple explanation of what this test is.",
                    "insight": "Specific insight based on this value."
                  }
                ]
              }
            ],

            "suggestions": [
              { "title": "Action Title", "icon": "Emoji", "description": "Specific advice" }
            ],

            "dietary_plan": {
              "title": "Diet Name",
              "description": "Overview",
              "macronutrients": { "protein": "X%", "carbs": "X%", "fats": "X%" },
              "meal_plan": {
                 "breakfast": ["${cuisinePref} Example 1", "Example 2"],
                 "lunch": ["${cuisinePref} Example 1"],
                 "dinner": ["${cuisinePref} Example 1"],
                 "snacks": ["Example 1"]
              },
              "lifestyle_tips": ["Tip 1", "Tip 2"],
              "allowed": ["Food 1", "Food 2"],
              "avoid": ["Food 1", "Food 2"],
              "hydration": "Advice"
            }
          }

          IMPORTANT:
          - Integrate findings from all files.
          - If duplicate tests exist, use the most critical/recent one.
          - Return ONLY valid JSON.
        `;

    const finalResult = await medGemmaModel.generateContent(synthesisPrompt);
    const finalText = finalResult.response.text();
    const cleanedFinalText = finalText.replace(/```json/g, "").replace(/```/g, "").trim();

    let jsonResponse;
    try {
      jsonResponse = JSON.parse(cleanedFinalText);
    } catch (e) {
      console.error("JSON Parse Error in Stage 2:", e);
      console.error("Raw Text:", finalText);
      // Fallback: try to return the vision extraction if synthesis failed, or error
      throw new Error("MedGemma Synthesis failed to produce valid JSON.");
    }

    console.log("MedGemma Analysis Complete. Tamil Summary present:", !!jsonResponse.summary_tamil);

    // Save to Supabase
    const { error: dbError } = await supabase
      .schema("medicalai")
      .from("reports")
      .insert({
        report_type: "blood",
        full_analysis_json: jsonResponse,
      });

    if (dbError) {
      console.error("Supabase Save Error:", dbError);
    }

    return new Response(JSON.stringify(jsonResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });

  } catch (error) {
    console.error("MedGemma API Error:", error);
    return new Response(JSON.stringify({ error: "Failed to analyze document", details: error.message }), { status: 500 });
  }
};
