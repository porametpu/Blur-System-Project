# Use Python 3.11 slim
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# 1. Install system dependencies
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

# 2. Optimized Monolithic Layer: Install + Download + Clean
# We combine everything to avoid layer bloat which causes Railway build failure
COPY requirements.txt download_models.py ./
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    python download_models.py && \
    apt-get purge -y --auto-remove build-essential && \
    rm -rf /root/.cache/pip /tmp/*

# 3. Copy only necessary app files
COPY main.py .
COPY .env . 

# Ensure directories exist
RUN mkdir -p temp uploads processed

# Port and Start
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
