-- Run this in your Supabase SQL Editor to update the existing table
-- It adds the missing columns required for Doctor Assisted AI

alter table medicalai.reports 
add column if not exists patient_name text,
add column if not exists doctor_name text,
add column if not exists doctor_diagnosis text,
add column if not exists deviations_json jsonb;

-- Force a schema cache reload (usually happens automatically, but good to ensure)
notify pgrst, 'reload config';
