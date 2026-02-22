-- Add Vitals columns to the reports table
alter table medicalai.reports 
add column if not exists patient_weight text,
add column if not exists patient_bp text,
add column if not exists patient_temperature text;

-- Force a schema cache reload
notify pgrst, 'reload config';
