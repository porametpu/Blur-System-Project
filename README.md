# BlurSystem - Privacy Protection

---

## 🛠️ Installation Guide (Step-by-Step)

### 1. Backend Setup (FastAPI)
The backend handles AI processing, video frame extraction, and blurring logic.

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Core Dependencies:**
   You can install them via the requirements file:
   ```bash
   pip install -r requirements.txt
   ```
   *Or manually install the main packages:*
   ```bash
   pip install fastapi uvicorn python-multipart ultralytics opencv-python-headless easyocr ffmpeg-python python-dotenv
   ```

4. **Environment Configuration (`backend/.env`):**
   Create a file named `.env` inside the `backend/` folder:
   ```env
   # Cloudinary Credentials (Required for media processing)
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret

   # Optional Database (If using History feature)
   DATABASE_URL=postgresql://user:password@localhost:5432/blurdb
   ```

5. **Run the AI Server:**
   ```bash
   python main.py
   ```
   *Available at: `http://localhost:8000`*

---

### 2. Frontend Setup (Next.js)

1. **Navigate to the frontend directory:**
   ```bash
   cd ../frontend
   ```

2. **Install all dependencies:**
   ```bash
   npm install
   ```
   *Main packages used: `lucide-react`, `cloudinary`, `axios`, `react-dropzone`, `react- konva`*

3. **Environment Configuration (`frontend/.env`):**
   Create a file named `.env` inside the `frontend/` folder:
   ```env
   # Frontend Cloudinary (API upload from client-side)
   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret

   # Backend Connection
   FASTAPI_URL=http://localhost:8000
   ```

4. **Database Migration (Prisma):**
   ```bash
   npx prisma generate
   # npx prisma db push (If you have a database connected)
   ```

5. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   *Available at: `http://localhost:3000`*

---
