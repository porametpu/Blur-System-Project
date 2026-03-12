# Use Python 3.11 slim - stable for AI/ML
FROM python:3.11-slim

# Build-time environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 1. Install system dependencies and clean up in one layer to save space
# Replaced libgl1-mesa-glx with libgl1 as per previous fix
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglapi-mesa \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. Install Python dependencies 
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# 3. Pre-download AI models 
# We do this separately to leverage Docker layer caching
COPY download_models.py .
RUN python download_models.py

# 4. Copy the rest of the application
# .dockerignore will handle excluding large local files
COPY . .

# 5. Clean up build tools to drastically reduce image size
RUN apt-get purge -y --auto-remove build-essential && \
    rm -rf /root/.cache/pip

# Port and Start Command
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
