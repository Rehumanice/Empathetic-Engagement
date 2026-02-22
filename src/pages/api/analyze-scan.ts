export const prerender = false;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../../lib/supabase";

export const POST = async ({ request }: { request: Request }) => {
    const data = await request.formData();
    // Support multiple files
    const files = data.getAll("file");
    const anatomy = data.get("anatomy") || "General";

    if (!files || files.length === 0) {
        return new Response(JSON.stringify({ error: "No files uploaded" }), { status: 400 });
    }

    const apiKey = import.meta.env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: "Server Error: GEMINI_API_KEY not configured" }), { status: 500 });
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        // --- STAGE 1: VISION ANALYSIS (Gemini Flash) ---
        // Use gemini-2.5-pro for high-reasoning, multimodal image understanding
        const visionModel = genAI.getGenerativeModel({ model: "models/gemini-2.5-pro" });

        // Process all images
        const imageParts = await Promise.all(
            files.map(async (file: FormDataEntryValue) => {
                if (file instanceof File) {
                    const arrayBuffer = await file.arrayBuffer();
                    return {
                        inlineData: {
                            data: Buffer.from(arrayBuffer).toString("base64"),
                            mimeType: file.type,
                        },
                    };
                }
                return null;
            })
        );

        const validImageParts = imageParts.filter(part => part !== null);

        if (validImageParts.length === 0) {
            return new Response(JSON.stringify({ error: "No valid image files processed" }), { status: 400 });
        }

        const visionPrompt = `
      You are an expert Radiologist and Medical AI Assistant. 
      The user has uploaded ${validImageParts.length} medical scan image(s). The suspected anatomy is: ${anatomy}.
      
      Analyze these images with **exhaustive clinical precision**. 
      1. Examine every visible anatomical structure in detail.
      2. If multiple views are provided, synthesize findings across them to create a 3D mental model.
      3. Explicitly report on "Negative Findings" (structures that are present and normal).
      4. **MODALITY CHECK**: If the image is an **Ultrasound**, pay special attention to echogenicity, shadowing, borders, and fluid collections.
      
      If the images are NOT medical scans, return a polite error and set "isMedical" to false.

      Provide a structured JSON response matching this EXACT schema:

      {
        "isMedical": true,
        "modality": "X-Ray | CT | MRI | Ultrasound",
        "anatomy": "Detected anatomy",
        "urgency": "Routine | Urgent | Critical",
        "confidence": 80-100,
        
        "summary": "Brief structured summary of the case.",
        "key_findings": ["Array of distinct, critical observations"],
        "clinical_correlations": ["Potential clinical implications of findings"],
        "deviation_from_normal": ["List of abnormalities or deviations"],
        "confidence_level": "Low | Medium | High",
        "notes_for_physician": ["Technical notes for the referring doctor"],

        "measurements": [
             // CRITICAL: You MUST provide a comprehensive list of standard radiological measurements.
             // If exact pixels aren't clear, provide plausible ESTIMATES for demonstration.
             // Examples: Cobb Angle (Spine), CTR (Heart), Renal sizes.
            {
               "label": "Name of measurement", 
               "value": "Value with unit", 
               "status": "Normal/Abnormal"
            }
        ]
      }

      Return ONLY valid JSON.
    `;

        console.log("Stage 1: Running Vision Analysis...");
        const visionResult = await visionModel.generateContent([
            visionPrompt,
            ...validImageParts
        ]);

        const visionResponseText = visionResult.response.text();
        const cleanedVisionText = visionResponseText.replace(/```json/g, "").replace(/```/g, "").trim();
        let rawFindings;
        try {
            rawFindings = JSON.parse(cleanedVisionText);
        } catch (e) {
            console.error("Stage 1 Parsing Error", e);
            console.error("Raw Vision Text:", visionResponseText);
            throw new Error(`Stage 1 Analysis Failed to produce valid JSON. Raw: ${visionResponseText.substring(0, 100)}...`);
        }

        if (!rawFindings.isMedical) {
            // Return early if not medical
            return new Response(JSON.stringify(rawFindings), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // --- STAGE 2: SYNTHESIS & WRAPPER (Gemma 3 - MedGemma) ---
        console.log("Stage 2: Running MedGemma Synthesis...");

        // Using Gemma 3 27B IT as the specialized medical synthesizer
        const synthesisModel = genAI.getGenerativeModel({ model: "models/gemma-3-27b-it" });

        const dietPref = data.get("diet") || "Balanced";
        const cuisinePref = data.get("cuisine") || "International";

        const synthesisPrompt = `
        You are **MedGemma** (Medical Generative Multi-modal Assistant).
        
        INPUT DATA (from Vision Model):
        ${JSON.stringify(rawFindings, null, 2)}

        YOUR TASK:
        Review the raw findings and generate a **Final Official Medical Report**.
        
        **CRITICAL DIETARY INSTRUCTION:**
        The patient follows a **${dietPref}** diet and prefers **${cuisinePref}** cuisine. 
        You MUST tailor the 'dietary_plan' (meal examples, recipes, food choices) strictly to this cuisine and diet type.

        REQUIREMENTS:
        1. **Professional Tone**: Use standard radiological terminology.
        2. **Empathy**: Comforting "patient_summary".
        3. **Tanglish**: Mandatory "summary_tamil".
        4. **Data Integrity**: Preserve ALL measurements and new fields (key_findings, etc.).

        OUTPUT JSON STRUCTURE:
        {
          "isMedical": true,
          "modality": "${rawFindings.modality}",
          "anatomy": "${rawFindings.anatomy}",
          "findings": "A rich HTML string (<ul>, <li>, <strong>) detailing the findings locally grouped by structure.",
          "impression": "Refined diagnostic impression.",
          "diagnosis": "Likely ICD-10 code and name.",
          "communication": {
              "patient_summary": "Simple, reassuring explanation.",
              "doctor_summary": "Technical clinical summary."
          },
          "urgency": "${rawFindings.urgency}",
          "summary_tamil": "MANDATORY. Tamil summary.",
          
          "summary": "${rawFindings.summary || ''}",
          "key_findings": ${JSON.stringify(rawFindings.key_findings || [])},
          "clinical_correlations": ${JSON.stringify(rawFindings.clinical_correlations || [])},
          "deviation_from_normal": ${JSON.stringify(rawFindings.deviation_from_normal || [])},
          "confidence_level": "${rawFindings.confidence_level || 'High'}",
          "notes_for_physician": ${JSON.stringify(rawFindings.notes_for_physician || [])},

          "measurements": ${JSON.stringify(rawFindings.measurements || [])},

          "recommendations": ["Array of 3-4 actionable next steps"],
          "dietary_plan": {
             "diet_preference": "${dietPref}",
             "cuisine_preference": "${cuisinePref}",
             "title": "Diet Name",
             "description": "Why this helps.",
             "macronutrients": { "protein": "X%", "carbs": "X%", "fats": "X%" },
             "meal_plan": {
                "breakfast": ["Example 1", "Example 2"],
                "lunch": ["Example 1"],
                "dinner": ["Example 1"],
                "snacks": ["Example 1"]
             },
             "lifestyle_tips": ["Tip 1", "Tip 2"],
             "allowed": ["Food 1", "Food 2"],
             "avoid": ["Food 1", "Food 2"],
             "hydration": "Advice"
          }
        }
        
        Return ONLY valid JSON.
        `;

        const synthesisResult = await synthesisModel.generateContent(synthesisPrompt);
        const synthesisResponseText = synthesisResult.response.text();
        const cleanedSynthesisText = synthesisResponseText.replace(/```json/g, "").replace(/```/g, "").trim();

        let finalJson;
        try {
            finalJson = JSON.parse(cleanedSynthesisText);
        } catch (e) {
            console.error("Stage 2 Parsing Error", e);
            console.error("Raw Synthesis Text:", synthesisResponseText);
            throw new Error(`Stage 2 (MedGemma) Failed to produce valid JSON. Raw: ${synthesisResponseText.substring(0, 100)}...`);
        }

        console.log("MedGemma Analysis Complete.");

        // Save to Supabase
        const { error: dbError } = await supabase
            .schema("medicalai")
            .from("reports")
            .insert({
                report_type: "scan",
                full_analysis_json: finalJson,
            });

        if (dbError) {
            console.error("Supabase Save Error:", dbError);
        }

        return new Response(JSON.stringify(finalJson), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });

    } catch (error: any) {
        console.error("Gemini/Gemma API Error:", error);
        return new Response(JSON.stringify({ error: "Analysis failed", details: error.message || String(error) }), { status: 500 });
    }
};
