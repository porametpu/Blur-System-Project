from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import shutil
import os
import cv2
import numpy as np
from ultralytics import YOLO
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
import json
import base64
from typing import Optional, List

load_dotenv()

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

app = FastAPI(title="Blur System AI API v5.0 - Full Video Processing")

# ─── MODELS SETUP ────────────────────────────────────────────
try:
    model = YOLO("yolov8n.pt")
    print("✅ YOLOv8 Intelligence Active - Processing Engine Ready")
except Exception as e:
    print(f"❌ Failed to load YOLOv8: {e}")
    model = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("temp", exist_ok=True)

def get_frame_at_time(path: str, timestamp_ms: float = 0):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened(): return None
    cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_ms)
    success, img = cap.read()
    cap.release()
    return img if success else None

def detect_faces_yolo(img):
    if model is None or img is None: return []
    h, w = img.shape[:2]
    results = model(img, classes=[0], conf=0.25)
    detections = []
    for r in results:
        for i, box in enumerate(r.boxes):
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0]]
            bw, bh = x2 - x1, y2 - y1
            face_w, face_h = int(bw * 0.90), int(bh * 0.35)
            fx1 = x1 + int((bw - face_w) / 2)
            fy1 = y1
            fx2, fy2 = fx1 + face_w, fy1 + face_h
            fx1, fy1 = max(0, fx1), max(0, fy1)
            fx2, fy2 = min(w, fx2), min(h, fy2)
            pad = int(face_h * 0.2)
            px1, py1 = max(0, fx1 - pad), max(0, fy1 - pad)
            px2, py2 = min(w, fx2 + pad), min(h, fy2 + pad)
            detections.append({
                "id": i,
                "bbox": {"x1": fx1, "y1": fy1, "x2": fx2, "y2": fy2},
                "face_bbox": {"x1": px1, "y1": py1, "x2": px2, "y2": py2}
            })
    return detections

def apply_blur(img, regions, b_type="gaussian", b_str=50):
    if img is None: return None
    res = img.copy()
    k_size = int(b_str)
    if k_size % 2 == 0: k_size += 1
    k_size = max(1, k_size)
    for r in regions:
        x1, y1, x2, y2 = [int(r.get(k, 0)) for k in ["x1", "y1", "x2", "y2"]]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(img.shape[1], x2), min(img.shape[0], y2)
        if x2 <= x1 or y2 <= y1: continue
        roi = res[y1:y2, x1:x2]
        if roi.size == 0: continue
        if b_type == "gaussian":
            roi = cv2.GaussianBlur(roi, (k_size, k_size), 30)
        elif b_type == "pixelate":
            rh, rw = roi.shape[:2]
            div = max(2, int(k_size / 4))
            sm = cv2.resize(roi, (max(1, rw // div), max(1, rh // div)), interpolation=cv2.INTER_LINEAR)
            roi = cv2.resize(sm, (rw, rh), interpolation=cv2.INTER_NEAREST)
        elif b_type == "black":
            roi = np.zeros_like(roi)
        res[y1:y2, x1:x2] = roi
    return res

def process_full_video(input_path, output_path, b_type, b_str, selective_regions=None):
    """Processes every frame of a video.selective_regions is used for static manual blur."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened(): return False
    
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    
    # Use avc1 for better compatibility, or mp4v as fallback
    fourcc = cv2.VideoWriter_fourcc(*'mp4v') 
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    frame_count = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        
        # Logic: If selective_regions is None, it's Auto-Blur (re-detect every frame)
        # If selective_regions is provided, these are static areas to blur (e.g. license plate in fixed camera)
        if selective_regions is None:
            ds = detect_faces_yolo(frame)
            rs = [d["face_bbox"] for d in ds]
        else:
            rs = selective_regions
            
        if rs:
            frame = apply_blur(frame, rs, b_type=b_type, b_str=b_str)
            
        out.write(frame)
        frame_count += 1
        
    cap.release()
    out.release()
    return True

@app.get("/")
def root():
    return {"status": "ok", "message": "v5.0 - Full Video Pipeline Active"}

@app.post("/api/detect-faces")
async def detect_faces(file: UploadFile = File(...), timestamp: float = Form(0)):
    p = f"temp/det_{file.filename}"
    with open(p, "wb") as f: shutil.copyfileobj(file.file, f)
    try:
        img = get_frame_at_time(p, timestamp)
        if img is None: img = cv2.imread(p)
        if img is None: raise HTTPException(400, "Invalid media")
        
        h, w = img.shape[:2]
        ds = detect_faces_yolo(img)
        
        # Generate thumbnails only for the requested frame
        for d in ds:
            x1, y1, x2, y2 = d["bbox"]["x1"], d["bbox"]["y1"], d["bbox"]["x2"], d["bbox"]["y2"]
            crop = img[y1:y2, x1:x2]
            if crop.size > 0:
                thumb = cv2.resize(crop, (200, 200))
                _, buf = cv2.imencode('.jpg', thumb)
                d["face_thumbnail"] = base64.b64encode(buf).decode('utf-8')
            else:
                d["face_thumbnail"] = ""

        os.remove(p)
        return {"detections": ds, "image_width": w, "image_height": h, "count": len(ds)}
    except Exception as e:
        if os.path.exists(p): os.remove(p)
        raise HTTPException(500, str(e))

@app.post("/api/process-image")
async def process_image(
    file: UploadFile = File(...), 
    blur_type: str = Form("gaussian"), 
    blur_strength: int = Form(50)
):
    p = f"temp/proc_{file.filename}"
    with open(p, "wb") as f: shutil.copyfileobj(file.file, f)
    try:
        ext = file.filename.split('.')[-1].lower()
        is_video = ext in ['mp4', 'avi', 'mov', 'mkv', 'webm']
        
        if is_video:
            o = f"temp/processed_{file.filename}.mp4"
            success = process_full_video(p, o, blur_type, blur_strength)
            if not success: raise HTTPException(500, "Video processing failed")
            up = cloudinary.uploader.upload(o, folder="blur_system/processed", resource_type="video")
            os.remove(p); os.remove(o)
        else:
            img = cv2.imread(p)
            ds = detect_faces_yolo(img)
            rs = [d["face_bbox"] for d in ds]
            if rs: img = apply_blur(img, rs, b_type=blur_type, b_str=blur_strength)
            o = f"temp/out_{file.filename}.jpg"
            cv2.imwrite(o, img)
            up = cloudinary.uploader.upload(o, folder="blur_system/processed")
            os.remove(p); os.remove(o)
            
        return {"blurred_url": up["secure_url"], "status": "success", "is_video": is_video}
    except Exception as e:
        if os.path.exists(p): os.remove(p)
        raise HTTPException(500, str(e))

@app.post("/api/selective-blur")
async def selective_blur(
    file: UploadFile = File(...), 
    regions: str = Form(...), 
    blur_type: str = Form("gaussian"),
    blur_strength: int = Form(50),
    timestamp: float = Form(0)
):
    p = f"temp/sel_{file.filename}"
    with open(p, "wb") as f: shutil.copyfileobj(file.file, f)
    try:
        ext = file.filename.split('.')[-1].lower()
        is_video = ext in ['mp4', 'avi', 'mov', 'mkv', 'webm']
        rs = json.loads(regions)
        
        if is_video:
            # For selective video, we currently treat regions as static (fixed coordinates)
            # This is common for censoring things like timestamps or stationary cars.
            o = f"temp/sel_out_{file.filename}.mp4"
            success = process_full_video(p, o, blur_type, blur_strength, selective_regions=rs)
            if not success: raise HTTPException(500, "Selective video processing failed")
            up = cloudinary.uploader.upload(o, folder="blur_system/processed", resource_type="video")
            os.remove(p); os.remove(o)
        else:
            img = cv2.imread(p)
            img = apply_blur(img, rs, b_type=blur_type, b_str=blur_strength)
            o = f"temp/res_{file.filename}.jpg"
            cv2.imwrite(o, img)
            up = cloudinary.uploader.upload(o, folder="blur_system/processed")
            os.remove(p); os.remove(o)

        return {"blurred_url": up["secure_url"], "status": "success", "is_video": is_video}
    except Exception as e:
        if os.path.exists(p): os.remove(p)
        raise HTTPException(500, str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
