-- Run this to fix the "Could not find allergies column" error.

-- 1. Add Allergies Column
alter table medicalai.patients 
add column if not exists allergies text[]; -- Array of strings

-- 2. Ensure JSON columns exist (if not already added)
alter table medicalai.patients 
add column if not exists health_summary_json jsonb;

alter table medicalai.patients 
add column if not exists chronic_conditions text[];

-- 3. Refresh Schema Cache
notify pgrst, 'reload config';
