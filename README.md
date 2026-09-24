# CleanIQ

> **Intelligent & Controlled Data Cleaning Platform**  
> CleanIQ is a modern, high-performance web platform designed to analyze, profile, clean, and standardize messy tabular datasets with surgical control, real-time visual previews, and undo/redo capabilities.

---

## Features

- **Automated Data Profiling:** Fast structural, statistical, and missing value profiling powered by pandas with mixed-format datetime inference.
- **Interactive Cleaning Studio:**
  - Null value handling (mean, median, mode, forward/backward fill, constant, drop).
  - Deduplication with custom subset selection and keep first/last logic.
  - Type auto-detection and safe column casting.
  - Outlier detection (IQR, Z-score, Isolation Forest) and treatment (capping, trimming).
  - Text normalization (case standardization, regex cleaning, trim, find/replace).
- **Quality Scoring & Analytics:** Real-time data quality score calculation across completeness, validity, uniqueness, and consistency.
- **Dynamic Visualizations:** Recharts-powered distribution curves, missingness heatmaps, and correlation matrices.
- **Operation History & Export:** Full audit trail with undo/redo stack and export to cleaned CSV/Excel.

---

## Tech Stack

### Frontend
- **Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Animations & Effects:** Framer Motion, GSAP, OGL (WebGl canvas particles)
- **Routing & State:** React Router 7 with code-split lazy routes
- **Charts:** Recharts

### Backend
- **Framework:** FastAPI (Python 3.13)
- **Engine:** Pandas 2.2, NumPy, openpyxl, xlrd, asteval
- **Testing:** Pytest (100% test pass rate)

---

## Getting Started

### Backend Setup
```bash
cd backend
python -m venv venv
# Windows
.\venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

---

## Testing & Verification
```bash
# Run backend test suite
cd backend
pytest

# Build frontend production bundle
cd frontend
npm run build
```
