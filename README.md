# Medical AI - Precision Diagnostics

> **Note**: This is a demo application showcasing the power of Generative AI in Healthcare.

## 🏥 Overview

Medical AI is a next-generation healthcare platform designed to assist doctors and patients with precision diagnostics. It leverages Google's **Gemini Pro** and **Gemini Flash** models to analyze medical data (Blood Reports, Radiology Scans) and provide actionable insights.

The platform includes a **Doctor-Assisted AI** mode that acts as a reliable second opinion, comparing a doctor's diagnosis with clinical evidence to calculate a deviation score.

## ✨ Key Features

- **Patient Management**: Complete digital health records (Vitals, History, Allergies).
- **Blood Report Analysis**: Upload a PDF/Image of a blood test, and the AI extracts values, identifies abnormalities, and generates a structured report with Tamil translation.
- **Radiology AI**: Intelligent analysis of X-Rays, CTs, and MRIs to detect findings and anatomical details.
- **Doctor-Patient Comparison**: A "Second Opinion" engine that verifies a doctor's diagnosis against uploaded evidence.
- **Visual Trends**: Graphing of patient vitals over time.

## 🛠 Tech Stack

- **Framework**: [Astro](https://astro.build/) (Server-Side Rendering)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL + RLS)
- **AI Models**: [Google Gemini](https://ai.google.dev/) (Pro & Flash)
- **Styling**: Vanilla CSS (Custom Design System)
- **Authentication**: Supabase Auth

## 🚀 Getting Started

### Prerequisites

1. **Node.js**: v18 or higher.
2. **Supabase Account**: A new project with the schemas provided in the root directory.
3. **Google Cloud Project**: With Gemini API enabled.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/medical-ai.git
   cd empathetic-engagement
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the root directory:
   ```env
   PUBLIC_SUPABASE_URL=your_supabase_url
   PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   GEMINI_API_KEY=your_gemini_api_key
   ```
   > **Note**: `GEMINI_API_KEY` is a secret and should only be accessed server-side (in API routes).

4. Run locally:
   ```bash
   npm run dev
   ```
   Visit `http://localhost:4321`.

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

- [**Architecture & Data Flow**](docs/ARCHITECTURE.md): Database schema and system design.
- [**AI Models & Prompts**](docs/AI_MODELS.md): Specifics of Gemini Pro/Flash usage and system prompts.

## 📂 Project Structure

```text
/
├── public/              # Static assets
├── src/
│   ├── components/      # Reusable UI components
│   ├── layouts/         # Page layouts
│   ├── lib/             # Supabase client & utilities
│   ├── pages/           # Astro pages & API routes
│   │   ├── api/         # Server-side API endpoints (AI logic here)
│   │   └── ...
│   └── styles/          # Global CSS
├── docs/                # Project documentation
└── package.json
```

## 🛡 Security

- This is a **demo application**.
- **RLS (Row Level Security)** policies in Supabase are currently set to `public` for easier testing. In a production environment, these must be locked down to authenticated users only.
