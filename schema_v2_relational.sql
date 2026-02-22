-- Medical AI Schema V2 - Relational Patient Management

-- 1. Patients Table: The core identity
create table if not exists medicalai.patients (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    full_name text not null,
    dob date, -- Optional, or just store age if easier for now
    age int,  -- Storing age directly for simplicity based on current inputs
    gender text,
    blood_type text,
    contact_info jsonb, -- { "phone": "...", "email": "..." }
    health_summary_json jsonb, 
    chronic_conditions text[], -- Array of tags like ['Diabetic', 'Hypertension']
    allergies text[] -- [NEW] Array of allergy tags like ['Penicillin', 'Peanuts']
);

-- 2. Clinical Visits Table: Specific interactions/appointments
--    This is where we track Vitals over time for graphing
create table if not exists medicalai.clinical_visits (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    patient_id uuid references medicalai.patients(id) on delete cascade not null,
    doctor_name text,
    visit_type text, -- 'consultation', 'follow_up', 'emergency'
    
    -- Clinical Notes
    symptoms text,
    doctor_diagnosis text, 
    consultation_notes text,
    
    -- Vitals (Quantitative data for graphing)
    weight_kg numeric,
    bp_systolic int,
    bp_diastolic int,
    temperature_f numeric,
    heart_rate int,
    
    -- AI Deviation Score for this visit (if applicable)
    ai_match_score int
);

-- 3. Medical Reports Table: The artifacts (replacing the old flat 'reports' table)
create table if not exists medicalai.medical_reports (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    visit_id uuid references medicalai.clinical_visits(id) on delete cascade, 
    patient_id uuid references medicalai.patients(id) on delete cascade not null, -- Redundant but useful for fast queries
    
    report_type text not null, -- 'blood', 'scan', 'prescription'
    
    -- The Analysis
    ai_analysis_json jsonb,
    
    -- Metadata
    file_name text,
    file_type text
);

-- Indexes for performance
create index if not exists idx_visits_patient on medicalai.clinical_visits(patient_id);
create index if not exists idx_reports_patient on medicalai.medical_reports(patient_id);
create index if not exists idx_visits_date on medicalai.clinical_visits(created_at desc);

-- RLS Policies (Open for Demo)
alter table medicalai.patients enable row level security;
alter table medicalai.clinical_visits enable row level security;
alter table medicalai.medical_reports enable row level security;

drop policy if exists "Public access patients" on medicalai.patients;
drop policy if exists "Public access visits" on medicalai.clinical_visits;
drop policy if exists "Public access reports" on medicalai.medical_reports;

create policy "Public access patients" on medicalai.patients for all using (true) with check (true);
create policy "Public access visits" on medicalai.clinical_visits for all using (true) with check (true);
create policy "Public access reports" on medicalai.medical_reports for all using (true) with check (true);
