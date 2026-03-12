from deepface import DeepFace
import os

def download():
    print("🚀 Pre-downloading AI models for Docker build...")
    
    # 1. Build ArcFace model (for Identity Re-ID)
    print("📦 Loading ArcFace...")
    DeepFace.build_model("ArcFace")
    
    # 2. Build MTCNN model (for Face Detection)
    # We trigger a dummy extraction to force MTCNN weights download
    import numpy as np
    dummy_img = np.zeros((100, 100, 3), dtype=np.uint8)
    print("📦 Loading MTCNN...")
    try:
        DeepFace.extract_faces(dummy_img, detector_backend='mtcnn', enforce_detection=False)
    except:
        pass

    # 3. Pull YOLO weights (Optional, but good practice)
    from ultralytics import YOLO
    print("📦 Loading YOLOv8n...")
    YOLO("yolov8n.pt")

    print("✅ All models cached successfully!")

if __name__ == "__main__":
    download()
