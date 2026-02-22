import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function run() {
    console.log("Fetching first patient...");
    const { data: patient, error: pErr } = await supabase.schema('medicalai').from('patients').select('*').limit(1).single();
    if (pErr) console.error("Patient Error:", pErr);
    else {
        console.log("Patient:", patient.id);
        console.log("Testing update...");
        const { data: updateData, error: uErr } = await supabase.schema('medicalai').from('patients')
            .update({ full_name: patient.full_name })
            .eq('id', patient.id)
            .select()
            .single();
        if (uErr) console.error("Update Error:", uErr);
        else console.log("Update Success!");
    }
}
run();
