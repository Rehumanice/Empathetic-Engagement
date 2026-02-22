-- Create a custom schema for the medical AI application
create schema if not exists medicalai;

-- Create the reports table to store all analysis types (Blood, Scan, Doctor Assisted)
create table if not exists medicalai.reports (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Type of report: 'blood', 'scan', 'doctor_case'
  report_type text not null,
  
  -- JSON Blob for the full AI response (flexible storage)
  full_analysis_json jsonb,

  -- New Fields for Doctor Assisted AI
  patient_name text,
  doctor_name text,
  doctor_diagnosis text, 
  deviations_json jsonb, -- Stores the comparison points and discrepancy list
  
  -- Metadata
  user_id uuid default auth.uid() -- Optional: link to Supabase Auth user if logged in
);

-- Enable Row Level Security (RLS)
alter table medicalai.reports enable row level security;

-- Policy: Allow anyone (anon) to insert reports (for demo purposes)
-- IN PRODUCTION: changing this to 'authenticated' users only is recommended
create policy "Enable insert for all users" 
on medicalai.reports for insert 
with check (true);

-- Policy: Allow anyone to read reports (for demo purposes)
create policy "Enable read for all users" 
on medicalai.reports for select 
using (true);

-- Optional: Create an index for faster history queries
create index if not exists idx_reports_created_at on medicalai.reports (created_at desc);
