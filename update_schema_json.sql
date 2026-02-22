-- Run this ONLY if you have already created the tables using the previous V2 script.
-- If you haven't created the tables yet, just run 'schema_v2_relational.sql' instead.

-- 1. Update Patients Table
alter table medicalai.patients 
drop column if exists health_summary,
add column if not exists health_summary_json jsonb;

-- 2. Update Clinical Visits Table
alter table medicalai.clinical_visits
drop column if exists doctor_diagnosis,
add column if not exists doctor_diagnosis_json jsonb;

notify pgrst, 'reload config';
