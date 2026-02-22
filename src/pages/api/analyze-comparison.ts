export const prerender = false;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../../lib/supabase";

export const POST = async ({ request }) => {
    try {
        const data = await request.formData();

        // 1. Extract Fields
        const patientId = data.get("patientId"); // Check if ID is passed
        const doctorName = data.get("doctorName");
        const patientName = data.get("patientName"); // Fallback for prompt context
        const doctorDiagnosis = data.get("doctorDiagnosis");
        const symptoms = data.get("symptoms");

        // Vitals
        const pWeight = data.get("patientWeight") ? parseFloat(data.get("patientWeight").toString()) : null;
        const pBP = data.get("patientBP") ? data.get("patientBP").toString() : null;
        const pTemp = data.get("patientTemp") ? parseFloat(data.get("patientTemp").toString()) : null;

        // BP split
        let sys = null, dia = null;
        if (pBP && pBP.includes('/')) {
            const [s, d] = pBP.split('/');
            sys = parseInt(s);
            dia = parseInt(d);
        }

        // 2. Extract Files
        const scanFiles = data.getAll("scanFile") as File[];
        const bloodFiles = data.getAll("bloodFile") as File[];
        const rxFiles = data.getAll("rxFile") as File[];

        if (!patientId) {
            return new Response(JSON.stringify({ error: "Missing Patient ID. Please select a patient first." }), { status: 400 });
        }

        const apiKey = import.meta.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "Server Error: GEMINI_API_KEY not configured" }), { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        async function getFilePart(fileEntry: any, label: string) {
            if (fileEntry && fileEntry.size > 0) {
                const arrayBuffer = await fileEntry.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString("base64");
                return {
                    part: { inlineData: { data: base64Data, mimeType: fileEntry.type } },
                    label: label
                };
            }
            return null;
        }

        const allFileData = [];

        for (const f of scanFiles) {
            const part = await getFilePart(f, "Radiology Scan");
            if (part) allFileData.push(part);
        }
        for (const f of bloodFiles) {
            const part = await getFilePart(f, "Blood Test Report");
            if (part) allFileData.push(part);
        }
        for (const f of rxFiles) {
            const part = await getFilePart(f, "Prescription/Notes");
            if (part) allFileData.push(part);
        }

        let extractedEvidenceText = "No additional files provided.";

        // --- STAGE 1: VISION EXTRACTION ---
        if (allFileData.length > 0) {
            console.log("Stage 1: Running Vision Extraction (Gemini 2.5 Pro)...");
            const visionModel = genAI.getGenerativeModel({ model: "models/gemini-2.5-pro" });
            const extractPrompt = `
                You are an expert Medical Data Extractor.
                Extract ALL relevant clinical data, measurements, and findings from the provided medical files.
                Return a detailed JSON object. Return ONLY valid JSON.
            `;
            const visionParts: any[] = [extractPrompt];
            for (const item of allFileData) {
                if (!item) continue;
                visionParts.push(`\n[ATTACHED EVIDENCE: ${item.label}]`);
                visionParts.push(item.part);
            }

            const visionResult = await visionModel.generateContent(visionParts);
            extractedEvidenceText = visionResult.response.text().replace(/```json/g, "").replace(/```/g, "").trim();
        }

        // --- STAGE 2: MEDGEMMA SYNTHESIS ---
        console.log("Stage 2: Running MedGemma Synthesis (Gemma 3 27B IT)...");
        const medGemmaModel = genAI.getGenerativeModel({ model: "models/gemma-3-27b-it" });
        const synthesisPrompt = `
            You are **MedGemma**, an expert Senior Medical Consultant AI assisting a doctor.
            
            CASE CONTEXT:
            - Doctor: ${doctorName}
            - Patient Name: ${patientName}
            - Vitals: Weight: ${pWeight}kg, BP: ${pBP}, Temp: ${pTemp}°F
            - Doctor's Clinical Diagnosis: "${doctorDiagnosis}"
            
            EXTRACTED MEDICAL EVIDENCE:
            ${extractedEvidenceText}
            
            YOUR TASK:
            1. Analyze the medical evidence provided (or rely on vitals if none).
            2. Compare the evidence against the Doctor's Diagnosis.
            3. Identify if the evidence SUPPORTS or CONTRADICTS the doctor's diagnosis.
            4. Provide a "Deviation Score" (0-100% deviation).
            5. Generate a detailed clinical report.
            
            OUTPUT FORMAT (JSON ONLY):
            {
                "match_score": number (0-100),
                "deviation_score": number (0-100),
                "status": "Aligned" | "Minor Deviation" | "Major Discrepancy",
                "comparison_analysis": {
                    "doctor_points": ["List of key points from doctor's input"],
                    "evidence_points": ["List of key findings from uploaded files/vitals"],
                    "discrepancies": ["List of specific conflicts"]
                },
                "ai_analysis": {
                     "findings": "Detailed radiological/lab interpretation.",
                     "impression": "Independent conclusion.",
                     "urgency": "Routine" | "Urgent" | "Critical"
                },
                "recommendations": ["Actionable next steps"],
                "healthScore": number (0-100)
            }
        `;

        const result = await medGemmaModel.generateContent(synthesisPrompt);
        const responseText = result.response.text();

        // 5. Parse JSON
        const cleanedText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        let jsonResponse;
        try {
            jsonResponse = JSON.parse(cleanedText);
        } catch (e) {
            // Fallback for malformed JSON
            console.error("JSON Parse Error", responseText);
            jsonResponse = { status: "Error", ai_analysis: { impression: responseText } };
        }

        // 6. Save to RELATIONAL Schema

        // A. Create Visit Record
        const { data: visitData, error: visitError } = await supabase
            .schema("medicalai")
            .from("clinical_visits")
            .insert({
                patient_id: patientId,
                doctor_name: doctorName,
                visit_type: 'consultation',
                symptoms: symptoms, // Saving symptoms
                doctor_diagnosis_json: { text: doctorDiagnosis }, // Saving simple text as JSON for now
                weight_kg: pWeight,
                bp_systolic: sys,
                bp_diastolic: dia,
                temperature_f: pTemp,
                ai_match_score: jsonResponse.match_score || 0
            })
            .select()
            .single();

        if (visitError) throw new Error("Failed to create visit: " + visitError.message);

        // B. Upload Files to Supabase Storage & Create Report Records
        // Helper to upload
        async function uploadFile(file: File, folder: string): Promise<string | null> {
            if (!file || file.size === 0) return null;

            const fileExt = file.name.split('.').pop();
            const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload to 'patient_records' bucket
            const { data, error } = await supabase.storage
                .from('patient_records')
                .upload(fileName, file);

            if (error) {
                console.warn(`Upload failed for ${file.name}:`, error);
                return null;
            }

            // Get Public URL
            const { data: publicUrlData } = supabase.storage
                .from('patient_records')
                .getPublicUrl(fileName);

            return publicUrlData.publicUrl;
        }

        // Determine Report Type
        const hasScan = scanFiles.length > 0;
        const hasBlood = bloodFiles.length > 0;

        let reportType = 'general_checkup';
        if (hasScan) reportType = 'scan_analysis';
        if (hasBlood) reportType = 'blood_analysis';
        if (hasScan && hasBlood) reportType = 'comprehensive_analysis';

        // Upload One Representative File (Priority: Scan > Blood > Rx) 
        // In a real app we'd save ALL files as separate rows or an array. 
        // For this demo, we'll pick the most significant one to link to the report.
        let fileToSave: File | null = null;
        if (hasScan && scanFiles[0].size > 0) fileToSave = scanFiles[0];
        else if (hasBlood && bloodFiles[0].size > 0) fileToSave = bloodFiles[0];
        else if (rxFiles.length > 0 && rxFiles[0].size > 0) fileToSave = rxFiles[0];

        let savedUrl = null;
        if (fileToSave && fileToSave.size > 0) {
            savedUrl = await uploadFile(fileToSave, patientId.toString());
        }

        const { error: reportError } = await supabase
            .schema("medicalai")
            .from("medical_reports")
            .insert({
                visit_id: visitData.id,
                patient_id: patientId,
                report_type: reportType,
                ai_analysis_json: jsonResponse,
                file_name: fileToSave?.name || "Combined Analysis",
                file_url: savedUrl // Saving the URL
            });

        if (reportError) throw new Error("Failed to save report: " + reportError.message);

        return new Response(JSON.stringify({
            ...jsonResponse,
            visit_id: visitData.id // vital for redirection
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Analysis API Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
