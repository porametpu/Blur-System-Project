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
import torch
import torch.nn.functional as F
from deepface import DeepFace

load_dotenv()

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

app = FastAPI(title="Blur System AI API v6.1 - DeepFace Tracking Integration")

# ─── MODELS SETUP ────────────────────────────────────────────
try:
    model = YOLO("yolov8n.pt")
    print("✅ YOLOv8 Intelligence Active - Processing Engine Ready")
except Exception as e:
    print(f"❌ Failed to load YOLOv8: {e}")
    model = None

# Pre-load DeepFace model for faster inference inside the engine 
try:
    # Use ArcFace for state-of-the-art Face Re-ID 
    print("⏳ Loading ArcFace Tracking Engine...")
    _ = DeepFace.build_model("ArcFace")
    print("✅ ArcFace Tracking Engine Ready")
    reid_active = True
except Exception as e:
    print(f"❌ ArcFace Extractor Failed: {e}")
    reid_active = False

def extract_face_embedding(img_crop):
    if not reid_active or img_crop.size == 0: return None
    try:
        # Use MTCNN for extraction - more robust than SSD, faster than RetinaFace
        obj = DeepFace.represent(img_path=img_crop, model_name="ArcFace", enforce_detection=True, detector_backend="mtcnn")
        if len(obj) > 0:
            emb = obj[0]["embedding"]
            # Convert to PyTorch tensor and L2 Normalize it
            t = torch.tensor(emb, dtype=torch.float32)
            return F.normalize(t, p=2, dim=0)
    except:
        return None

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

def detect_faces_ai(img):
    """Uses DeepFace with RetinaFace backend for industry-leading accuracy."""
    if not reid_active or img is None: return []
    try:
        # RetinaFace is the most robust detector in DeepFace
        faces = DeepFace.extract_faces(img_path=img, detector_backend='retinaface', enforce_detection=False)
        h, w = img.shape[:2]
        detections = []
        print(f"🔍 AI Scan (RetinaFace): Found {len(faces)} potential faces")
        for i, face in enumerate(faces):
            # face["confidence"] for retinaface is very high usually
            if face["confidence"] < 0.4: continue
            
            area = face["facial_area"]
            fx, fy, fw, fh = area["x"], area["y"], area["w"], area["h"]
            
            # Create a Slightly padded bbox for the actual blur
            pad_w, pad_h = int(fw * 0.1), int(fh * 0.1)
            px1, py1 = max(0, fx - pad_w), max(0, fy - pad_h)
            px2, py2 = min(w, fx + fw + pad_w), min(h, fy + fh + pad_h)
            
            detections.append({
                "id": i,
                "bbox": {"x1": fx, "y1": fy, "x2": fx + fw, "y2": fy + fh},
                "face_bbox": {"x1": px1, "y1": py1, "x2": px2, "y2": py2},
                "confidence": float(face["confidence"])
            })
        return detections
    except Exception as e:
        print(f"Detection Error: {e}")
        return []

def detect_faces_fast(img):
    """Accurate MTCNN-based face detection for video processing (~250ms/frame)."""
    if img is None: return []
    try:
        # MTCNN is much more robust than SSD for video tracking
        faces = DeepFace.extract_faces(img_path=img, detector_backend='mtcnn', enforce_detection=False)
        h, w = img.shape[:2]
        detections = []
        for i, face in enumerate(faces):
            conf = face.get("confidence", 0)
            if conf < 0.3: continue
            
            area = face["facial_area"]
            fx, fy, fw, fh = area["x"], area["y"], area["w"], area["h"]
            
            # Create a Slightly padded bbox for the actual blur
            pad_w, pad_h = int(fw * 0.15), int(fh * 0.15)
            px1, py1 = max(0, fx - pad_w), max(0, fy - pad_h)
            px2, py2 = min(w, fx + fw + pad_w), min(h, fy + fh + pad_h)
            
            detections.append({
                "id": i,
                "bbox": {"x1": fx, "y1": fy, "x2": fx + fw, "y2": fy + fh},
                "face_bbox": {"x1": px1, "y1": py1, "x2": px2, "y2": py2},
                "confidence": conf
            })
        return detections
    except Exception as e:
        return []

def calculate_iou(box1, box2):
    """Calculates Intersection over Union for two bounding boxes {"x1", "y1", "x2", "y2"}."""
    xA = max(box1["x1"], box2["x1"])
    yA = max(box1["y1"], box2["y1"])
    xB = min(box1["x2"], box2["x2"])
    yB = min(box1["y2"], box2["y2"])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    box1Area = (box1["x2"] - box1["x1"]) * (box1["y2"] - box1["y1"])
    box2Area = (box2["x2"] - box2["x1"]) * (box2["y2"] - box2["y1"])
    denom = float(box1Area + box2Area - interArea)
    return interArea / denom if denom > 0 else 0

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

def process_full_video(input_path, output_path, b_type, b_str, selective_regions=None, action="static", target_embeddings=None):
    """Processes video using v8.2 MTCNN Face Detection + Native IoU Tracking."""
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened(): return False
    
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    frame_count = 0
    next_track_id = 1
    active_tracks = {} 
    max_missing = 10 # More persistence with MTCNN
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame_count += 1
        
        if frame_count % 30 == 0:
            print(f"⏳ Processing frame {frame_count}/{total_frames}")
        
        rs = []
        if action == "static":
            if selective_regions is None:
                ds = detect_faces_fast(frame) 
                rs = [d["face_bbox"] for d in ds]
            else:
                rs = selective_regions
                
        elif action in ["blur_only", "blur_except"] and target_embeddings:
            # Use MTCNN (detect_faces_fast) for robust frame detections
            mtcnn_faces = detect_faces_fast(frame)
            matched_indices = set()
            new_active_tracks = {}
            
            # 1. Update existing tracks using IoU matching
            for t_id, track in active_tracks.items():
                best_iou = 0
                best_idx = -1
                for idx, mf in enumerate(mtcnn_faces):
                    if idx in matched_indices: continue
                    iou = calculate_iou(track["bbox"], mf["face_bbox"])
                    if iou > best_iou:
                        best_iou = iou
                        best_idx = idx
                
                if best_iou >= 0.20: # Match found
                    matched_indices.add(best_idx)
                    mf = mtcnn_faces[best_idx]
                    track["bbox"] = mf["face_bbox"]
                    track["missing_frames"] = 0
                    new_active_tracks[t_id] = track
                else:
                    # Missing in this frame, try to persist
                    track["missing_frames"] += 1
                    if track["missing_frames"] <= max_missing:
                        new_active_tracks[t_id] = track

                # Blur if identity matches
                if t_id in new_active_tracks:
                    if (action == "blur_only" and new_active_tracks[t_id]["is_match"]) or \
                       (action == "blur_except" and not new_active_tracks[t_id]["is_match"]):
                        rs.append(new_active_tracks[t_id]["bbox"])
            
            # 2. Add New Tracks for unmatched MTCNN faces
            for idx, mf in enumerate(mtcnn_faces):
                if idx in matched_indices: continue
                cb = mf["face_bbox"]
                face_crop = frame[cb["y1"]:cb["y2"], cb["x1"]:cb["x2"]]
                
                if face_crop.size > 0:
                    emb = extract_face_embedding(face_crop)
                    is_match = False
                    best_dist = 999.0
                    if emb is not None:
                        for tgt in target_embeddings:
                            cos_sim = F.cosine_similarity(emb.unsqueeze(0), tgt.unsqueeze(0)).item()
                            dist = 1 - cos_sim
                            best_dist = min(best_dist, dist)
                            if dist < 0.50: # Standard ArcFace threshold
                                is_match = True
                                break
                    
                    print(f"   👤 New Track (ID={next_track_id}): match={is_match}, best_dist={best_dist:.4f}")
                    new_active_tracks[next_track_id] = {
                        "bbox": cb,
                        "is_match": is_match,
                        "missing_frames": 0
                    }
                    if (action == "blur_only" and is_match) or (action == "blur_except" and not is_match):
                        rs.append(cb)
                    next_track_id += 1
                    
            active_tracks = new_active_tracks
                        
        if rs:
            frame = apply_blur(frame, rs, b_type=b_type, b_str=b_str)
            
        out.write(frame)
        
    cap.release()
    out.release()
    print(f"✅ Video processing complete: {frame_count} frames")
    return True

@app.get("/")
def root():
    return {"status": "ok", "message": "v6.0 - Smart Tracking Active"}

@app.post("/api/detect-faces")
async def detect_faces(file: UploadFile = File(...), timestamp: float = Form(0)):
    p = f"temp/det_{file.filename}"
    with open(p, "wb") as f: shutil.copyfileobj(file.file, f)
    try:
        img = get_frame_at_time(p, timestamp)
        if img is None: img = cv2.imread(p)
        if img is None: raise HTTPException(400, "Invalid media")
        
        h, w = img.shape[:2]
        ds = detect_faces_ai(img)
        
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
            ds = detect_faces_ai(img)
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
    timestamp: float = Form(0),
    action: str = Form("static")
):
    p = f"temp/sel_{file.filename}"
    with open(p, "wb") as f: shutil.copyfileobj(file.file, f)
    try:
        print(f"📋 Selective Blur Request: action={action}, blur_type={blur_type}, strength={blur_strength}, timestamp={timestamp}")
        ext = file.filename.split('.')[-1].lower()
        is_video = ext in ['mp4', 'avi', 'mov', 'mkv', 'webm']
        rs = json.loads(regions)
        print(f"📋 Regions count: {len(rs)}, is_video: {is_video}")
        
        if is_video:
            target_embeddings = []
            if action in ["blur_only", "blur_except"] and reid_active:
                print(f"🎯 Extracting reference embeddings from timestamp {timestamp}ms...")
                ref_img = get_frame_at_time(p, timestamp)
                if ref_img is not None:
                    h, w = ref_img.shape[:2]
                    print(f"🎯 Reference frame size: {w}x{h}")
                    
                    # Use high-accuracy RetinaFace for the reference frame extraction
                    ref_detections = detect_faces_ai(ref_img)
                    print(f"🎯 AI Scan found {len(ref_detections)} potential faces in reference frame")
                    
                    for r in rs:
                        rx1, ry1, rx2, ry2 = [int(r.get(k, 0)) for k in ["x1", "y1", "x2", "y2"]]
                        rcx, rcy = (rx1 + rx2) / 2, (ry1 + ry2) / 2
                        print(f"🎯 Selected face center: ({rcx:.0f}, {rcy:.0f})")
                        
                        # Find the detection that contains this face center
                        best_face_crop = None
                        best_overlap = 0
                        for det in ref_detections:
                            b = det["bbox"] # Use the raw bbox for containment check
                            if b["x1"] <= rcx <= b["x2"] and b["y1"] <= rcy <= b["y2"]:
                                area = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
                                if best_face_crop is None or area < best_overlap:
                                    best_overlap = area
                                    cb = det["bbox"]
                                    best_face_crop = ref_img[cb["y1"]:cb["y2"], cb["x1"]:cb["x2"]]
                        
                        if best_face_crop is not None and best_face_crop.size > 0:
                            print(f"🎯 Using AI detection crop: {best_face_crop.shape}")
                            emb = extract_face_embedding(best_face_crop)
                        else:
                            # Fallback: use the selected face region directly if no AI detection found
                            print(f"🎯 Fallback: using manual face region crop")
                            crop = ref_img[max(0, ry1):min(h, ry2), max(0, rx1):min(w, rx2)]
                            emb = extract_face_embedding(crop)
                        
                        if emb is not None:
                            target_embeddings.append(emb)
                            print(f"✅ Got embedding for region")
                        else:
                            print(f"⚠️ Failed to get embedding for region")
                else:
                    print(f"⚠️ Could not read reference frame at {timestamp}ms")
            
            print(f"🚀 Starting video processing with {len(target_embeddings)} target embeddings, action={action}")
            o = f"temp/sel_out_{file.filename}.mp4"
            success = process_full_video(p, o, blur_type, blur_strength, selective_regions=rs, action=action, target_embeddings=target_embeddings)
            if not success: raise HTTPException(500, "Selective video processing failed")
            up = cloudinary.uploader.upload(o, folder="blur_system/processed", resource_type="video")
            os.remove(p); os.remove(o)
        else:
            img = cv2.imread(p)
            if action == "blur_except":
                all_faces = detect_faces_ai(img)
                selected_embs = []
                for r in rs:
                    x1, y1, x2, y2 = [int(r.get(k, 0)) for k in ["x1", "y1", "x2", "y2"]]
                    c = img[max(0, y1):min(img.shape[0], y2), max(0, x1):min(img.shape[1], x2)]
                    e = extract_face_embedding(c)
                    if e is not None: selected_embs.append(e)

                final_rs = []
                for face in all_faces:
                    bbox = face["face_bbox"]
                    if selected_embs:
                        c = img[bbox["y1"]:bbox["y2"], bbox["x1"]:bbox["x2"]]
                        e = extract_face_embedding(c)
                        match = False
                        if e is not None:
                            for tgt in selected_embs:
                                sim = F.cosine_similarity(e.unsqueeze(0), tgt.unsqueeze(0)).item()
                                if (1 - sim) < 0.50:
                                    match = True; break
                        if not match: final_rs.append(bbox)
                    else:
                        cx, cy = (bbox["x1"]+bbox["x2"])/2, (bbox["y1"]+bbox["y2"])/2
                        is_selected = False
                        for r in rs:
                            if r["x1"] < cx < r["x2"] and r["y1"] < cy < r["y2"]:
                                is_selected = True; break
                        if not is_selected: final_rs.append(bbox)
                
                img = apply_blur(img, final_rs, b_type=blur_type, b_str=blur_strength)
            else:
                img = apply_blur(img, rs, b_type=blur_type, b_str=blur_strength)
                
            o = f"temp/res_{file.filename}.jpg"
            cv2.imwrite(o, img)
            up = cloudinary.uploader.upload(o, folder="blur_system/processed")
            os.remove(p); os.remove(o)

        return {"blurred_url": up["secure_url"], "status": "success", "is_video": is_video}
    except Exception as e:
        import traceback
        traceback.print_exc()
        if os.path.exists(p): os.remove(p)
        raise HTTPException(500, str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
