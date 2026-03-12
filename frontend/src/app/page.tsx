"use client";

import React, { useState, useRef, useEffect } from "react";
import UploadArea from "@/components/UploadArea";
import {
  Sparkles, Shield, UserX, CreditCard, Download, RotateCcw,
  Loader2, CheckCircle2, Eye, ArrowLeft, Pencil, Scan,
  Undo2, AlertCircle, Info, Trash2, ChevronRight, Play, RefreshCw, Sliders
} from "lucide-react";

// ─── TYPES ──────────────────────────────────────────────────
interface Detection {
  id: number;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  face_bbox: { x1: number; y1: number; x2: number; y2: number };
  face_thumbnail: string;
}

interface BlurRegion {
  x1: number; y1: number; x2: number; y2: number;
  source: 'manual' | 'ai';
  id?: number;
}

type Step = 'upload' | 'preview' | 'detect' | 'manual' | 'result';
type BlurType = 'gaussian' | 'pixelate' | 'black';

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // AI settings
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedFaces, setSelectedFaces] = useState<Set<number>>(new Set());
  const [imgDimensions, setImgDimensions] = useState({ w: 1, h: 1 });
  const [blurType, setBlurType] = useState<BlurType>('gaussian');
  const [blurStrength, setBlurStrength] = useState<number>(50);

  // Manual blur
  const [manualRegions, setManualRegions] = useState<BlurRegion[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDraw, setCurrentDraw] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | HTMLVideoElement>(null);

  // ─── HANDLERS ────────────────────────────────────────────
  const handleUpload = (uploadedFile: File) => {
    setFile(uploadedFile);
    setPreviewUrl(URL.createObjectURL(uploadedFile));
    setStep('preview');
    setResult(null);
    setError(null);
    setDetections([]);
    setManualRegions([]);
    setSelectedFaces(new Set());
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setStep('upload');
    setResult(null);
    setError(null);
    setDetections([]);
    setManualRegions([]);
    setSelectedFaces(new Set());
  };

  const goBack = () => {
    if (step === 'result') { setStep('preview'); setResult(null); return; }
    if (step === 'detect' || step === 'manual') { setStep('preview'); return; }
    if (step === 'preview') { handleReset(); return; }
  };

  // ─── API CALLS ───────────────────────────────────────────
  const autoBlur = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'auto');
      fd.append('blurType', blurType);
      fd.append('blurStrength', blurStrength.toString());

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) { setResult(data); setStep('result'); } else { setError(data.error || 'Auto-blur processing failed.'); }
    } catch { setError('Connection error.'); } finally { setIsProcessing(false); }
  };

  const startDetection = async () => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    const ts = (file.type.startsWith('video/') && imgRef.current)
      ? (imgRef.current as HTMLVideoElement).currentTime * 1000
      : 0;

    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('mode', 'detect'); fd.append('timestamp', ts.toString());
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        setDetections(data.detections || []);
        setImgDimensions({ w: data.imageWidth || 1, h: data.imageHeight || 1 });
        setSelectedFaces(new Set((data.detections || []).map((d: any) => d.id)));
        setStep('detect');
      } else { setError(data.error || 'AI Detection Failed.'); }
    } catch { setError('AI Engine is currently unavailable.'); } finally { setIsProcessing(false); }
  };

  const applySelective = async (regions: BlurRegion[], action: 'static' | 'blur_only' | 'blur_except' = 'static') => {
    if (!file) return;
    setIsProcessing(true); setError(null);
    const ts = (file.type.startsWith('video/') && imgRef.current)
      ? (imgRef.current as HTMLVideoElement).currentTime * 1000
      : 0;

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'selective');
      fd.append('regions', JSON.stringify(regions));
      fd.append('blurType', blurType);
      fd.append('blurStrength', blurStrength.toString());
      fd.append('timestamp', ts.toString());
      fd.append('action', action);

      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) { setResult(data); setStep('result'); } else { setError(data.error || 'Failed to apply selective blur.'); }
    } catch { setError('Network Error.'); } finally { setIsProcessing(false); }
  };

  // ─── DRAWING LOGIC ───────────────────────────────────────
  const getScaledCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return null;
    const rect = container.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
    else { clientX = e.clientX; clientY = e.clientY; }

    const scaleX = ((img as any).naturalWidth || (img as any).videoWidth || 1) / rect.width;
    const scaleY = ((img as any).naturalHeight || (img as any).videoHeight || 1) / rect.height;
    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY),
    };
  };

  const onStartDraw = (e: React.MouseEvent) => {
    if (isProcessing) return;
    const c = getScaledCoords(e); if (!c) return;
    setIsDrawing(true); setDrawStart(c); setCurrentDraw(c);
  };

  const onMoveDraw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const c = getScaledCoords(e); if (c) setCurrentDraw(c);
  };

  const onEndDraw = () => {
    if (!isDrawing || !drawStart || !currentDraw) { setIsDrawing(false); return; }
    const r: BlurRegion = {
      x1: Math.min(drawStart.x, currentDraw.x), y1: Math.min(drawStart.y, currentDraw.y),
      x2: Math.max(drawStart.x, currentDraw.x), y2: Math.max(drawStart.y, currentDraw.y),
      source: 'manual'
    };
    if (Math.abs(r.x2 - r.x1) > 5 && Math.abs(r.y2 - r.y1) > 5) setManualRegions(prev => [...prev, r]);
    setIsDrawing(false); setDrawStart(null); setCurrentDraw(null);
  };

  // ─── RENDER HELPERS ──────────────────────────────────────
  const renderStepHeader = (title: string, desc: string) => (
    <div className="mb-6 border-b border-blue-100 pb-4">
      <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">{title}</h2>
      <p className="text-slate-500 text-base mt-2 font-medium">{desc}</p>
    </div>
  );

  const blurStyles: { id: BlurType, label: string, icon: string }[] = [
    { id: 'gaussian', label: 'Gaussian Blur', icon: '🔵' },
    { id: 'pixelate', label: 'Pixelate', icon: '🟩' },
    { id: 'black', label: 'Black Box', icon: '⬛' },
  ];

  return (
    <div className="min-h-full flex flex-col items-center">
      {/* Hero Section */}
      {step === 'upload' && (
        <div className="text-center mt-8 mb-16 space-y-6 max-w-4xl fade-slide-in">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-slate-900 leading-none">
            Blur System For <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400">
              Privacy Protection
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
            Blur your information ................
          </p>
        </div>
      )}

      {/* Navigation & Status */}
      {step !== 'upload' && (
        <div className="w-full max-w-6xl mb-8 flex justify-between items-center fade-slide-in px-4">
          <button onClick={goBack} className="group flex items-center gap-3 text-slate-600 hover:text-blue-600 transition-all font-bold text-sm bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm transition-all active:scale-95" disabled={isProcessing}>
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Go Back
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 border border-slate-200">
              <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {isProcessing ? 'Processing...' : 'Ready'}
              </span>
            </div>
            <div className="text-xs font-black uppercase tracking-widest text-blue-600 px-4 py-2 bg-blue-50 rounded-full border border-blue-200">
              {step}
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-6xl fade-slide-in mb-20 px-4" style={{ animationDelay: '0.1s' }}>
        {step === 'upload' ? (
          <UploadArea onUpload={handleUpload} />
        ) : (
          <div className="glass-panel p-8 shadow-2xl shadow-blue-500/10 bg-white/95 border-blue-100 border-2 overflow-hidden">

            {/* 📍 STEP: PREVIEW / MODE SELECTION */}
            {step === 'preview' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-slate-50 rounded-[2.5rem] aspect-square flex items-center justify-center border-4 border-slate-100 overflow-hidden shadow-2xl relative group ring-1 ring-blue-50">
                    {file?.type.startsWith('video/') ? (
                      <video ref={imgRef as any} src={previewUrl!} className="w-full h-full object-contain bg-slate-900" controls />
                    ) : (
                      <img ref={imgRef as any} src={previewUrl!} alt="Preview" className="w-full h-full object-cover" />
                    )}
                  </div>

                  {/* Common Controls for Auto-Blur */}
                  <div className="p-8 bg-slate-50 rounded-[2rem] border-2 border-slate-100 space-y-8">
                    <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                      <Sliders className="w-4 h-4" /> Settings
                    </h4>
                    <BlurStyleSelector value={blurType} onChange={setBlurType} options={blurStyles} />
                    <IntensitySlider value={blurStrength} onChange={setBlurStrength} />
                  </div>
                </div>

                <div className="lg:col-span-7 flex flex-col">
                  {renderStepHeader("TOOLS", "Configuration")}

                  <div className="grid grid-cols-1 gap-4 mb-8">
                    <ModeCard icon={<Sparkles className="w-6 h-6" />} title="AI Auto-Blur" desc="Full AI Detection." color="blue" onClick={autoBlur} disabled={isProcessing} primary />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ModeCard icon={<Scan className="w-6 h-6" />} title="Detect & Select" desc="AI Detection and Select Specifics Face." color="cyan" onClick={startDetection} disabled={isProcessing} />
                      <ModeCard icon={<Pencil className="w-6 h-6" />} title="Manual Control" desc="Crop,Drawing Shape for blur" color="indigo" onClick={() => setStep('manual')} disabled={isProcessing} />
                    </div>
                  </div>

                  {isProcessing && (
                    <div className="flex items-center gap-4 p-6 bg-blue-50 rounded-3xl border-2 border-blue-100 text-blue-700 animate-pulse mt-auto">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <div>
                        <span className="font-black text-sm block tracking-tight uppercase">Processing</span>
                        <span className="text-xs font-medium opacity-80">Refining and processing media assets...</span>
                      </div>
                    </div>
                  )}
                  {error && (
                    <div className="p-6 bg-red-50 border-2 border-red-100 rounded-3xl text-red-600 flex items-center gap-4 mt-auto">
                      <AlertCircle className="w-8 h-8" />
                      <div><span className="font-black text-sm block uppercase">Error</span><span className="text-xs font-medium">{error}</span></div>
                    </div>
                  )}

                  {!isProcessing && (
                    <button onClick={autoBlur} className="mt-auto w-full group relative overflow-hidden bg-slate-900 text-white py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-95 shadow-xl">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <span className="relative z-10 flex items-center gap-3"><Play className="w-6 h-6 fill-current" /> Blur</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 📍 STEP: DETECT */}
            {step === 'detect' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8 space-y-4">
                  <div className="relative bg-slate-900 rounded-[2.5rem] overflow-hidden border-8 border-slate-100 shadow-2xl">
                    {file?.type.startsWith('video/') ? (
                      <video ref={imgRef as any} src={previewUrl!} className="w-full h-auto block" controls />
                    ) : (
                      <img src={previewUrl!} alt="Detections" className="w-full h-auto block" />
                    )}
                    {detections.map(d => (
                      <div key={d.id} onClick={() => setSelectedFaces(prev => {
                        const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n;
                      })}
                        className={`absolute border-2 cursor-pointer transition-all duration-300 ${selectedFaces.has(d.id) ? 'border-green-400 bg-green-500/20 scale-[1.02]' : 'border-red-400 bg-red-500/10 grayscale opacity-40'}`}
                        style={{
                          left: `${(d.face_bbox.x1 / imgDimensions.w) * 100}%`,
                          top: `${(d.face_bbox.y1 / imgDimensions.h) * 100}%`,
                          width: `${((d.face_bbox.x2 - d.face_bbox.x1) / imgDimensions.w) * 100}%`,
                          height: `${((d.face_bbox.y2 - d.face_bbox.y1) / imgDimensions.h) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                  {file?.type.startsWith('video/') && (
                    <button onClick={startDetection} disabled={isProcessing} className="w-full py-4 bg-white border-4 border-slate-100 rounded-2xl font-black text-slate-700 hover:border-blue-500 transition-all flex items-center justify-center gap-3 shadow-md">
                      <RefreshCw className={`w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`} /> Scan New Frame
                    </button>
                  )}
                </div>
                <div className="lg:col-span-4 flex flex-col">
                  {renderStepHeader("Face Map", `${detections.length} identities found.`)}

                  <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar flex-1 mb-8">
                    {detections.map(d => (
                      <button key={d.id} onClick={() => setSelectedFaces(prev => {
                        const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n;
                      })}
                        className={`group relative aspect-square rounded-[1.5rem] overflow-hidden border-4 transition-all ${selectedFaces.has(d.id) ? 'border-green-400 scale-95 shadow-lg' : 'border-slate-100 opacity-40'}`}
                      >
                        <img src={`data:image/jpeg;base64,${d.face_thumbnail}`} className="w-full h-full object-cover" alt="Face" />
                        <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${selectedFaces.has(d.id) ? 'bg-green-500/10' : 'bg-black/20 opacity-0 group-hover:opacity-100'}`}>
                          <CheckCircle2 className="text-white w-8 h-8" />
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-8 pt-8 border-t border-slate-100">
                    <BlurStyleSelector value={blurType} onChange={setBlurType} options={blurStyles} />
                    <IntensitySlider value={blurStrength} onChange={setBlurStrength} />
                    {file?.type.startsWith('video/') ? (
                      <div className="flex flex-col gap-3">
                        <button onClick={() => applySelective(detections.filter(d => selectedFaces.has(d.id)).map(d => ({ ...d.face_bbox, source: 'ai' })), 'blur_only')} disabled={isProcessing || selectedFaces.size === 0} className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-2xl font-black text-sm shadow-xl hover:-translate-y-1 transition-all disabled:opacity-30 flex items-center justify-center gap-2">
                          <Eye className="w-5 h-5" /> Blur Selected Person (Track)
                        </button>
                        <button onClick={() => applySelective(detections.filter(d => selectedFaces.has(d.id)).map(d => ({ ...d.face_bbox, source: 'ai' })), 'blur_except')} disabled={isProcessing || selectedFaces.size === 0} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl hover:-translate-y-1 transition-all disabled:opacity-30 flex items-center justify-center gap-2">
                          <Shield className="w-5 h-5" /> Blur EVERYONE EXCEPT Selected
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => applySelective(detections.filter(d => selectedFaces.has(d.id)).map(d => ({ ...d.face_bbox, source: 'ai' })))} disabled={isProcessing || selectedFaces.size === 0} className="w-full py-5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-3xl font-black text-xl shadow-2xl hover:-translate-y-1 transition-all disabled:opacity-30 flex items-center justify-center gap-2">
                        Start Processing
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 📍 STEP: MANUAL */}
            {step === 'manual' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <div className="lg:col-span-8">
                  <div ref={containerRef} className="relative bg-slate-900 rounded-[2.5rem] overflow-hidden border-8 border-slate-100 shadow-2xl cursor-crosshair" onMouseDown={onStartDraw} onMouseMove={onMoveDraw} onMouseUp={onEndDraw} onMouseLeave={onEndDraw}>
                    {file?.type.startsWith('video/') ? (
                      <video ref={imgRef as any} src={previewUrl!} className="w-full h-auto block" controls />
                    ) : (
                      <img ref={imgRef as any} src={previewUrl!} alt="Manual" className="w-full h-auto pointer-events-none" />
                    )}
                    <div className="absolute inset-0 pointer-events-none">
                      {manualRegions.map((r, i) => {
                        const img = imgRef.current as any;
                        const natW = img?.naturalWidth || img?.videoWidth || 1;
                        const natH = img?.naturalHeight || img?.videoHeight || 1;
                        return (
                          <div key={i} className="absolute border-4 border-indigo-400 bg-indigo-500/30 backdrop-blur-[2px] shadow-lg" style={{ left: `${(r.x1 / natW) * 100}%`, top: `${(r.y1 / natH) * 100}%`, width: `${((r.x2 - r.x1) / natW) * 100}%`, height: `${((r.y2 - r.y1) / natH) * 100}%` }}>
                            <span className="absolute -top-7 left-0 bg-indigo-600 text-white text-[10px] font-black px-3 py-1 rounded-lg">ZONE_{i + 1}</span>
                          </div>
                        );
                      })}
                      {isDrawing && drawStart && currentDraw && (() => {
                        const img = imgRef.current as any;
                        const natW = img?.naturalWidth || img?.videoWidth || 1;
                        const natH = img?.naturalHeight || img?.videoHeight || 1;
                        return (
                          <div className="absolute border-4 border-dashed border-white bg-white/20 backdrop-blur-[2px]" style={{ left: `${(Math.min(drawStart.x, currentDraw.x) / natW) * 100}%`, top: `${(Math.min(drawStart.y, currentDraw.y) / natH) * 100}%`, width: `${(Math.abs(currentDraw.x - drawStart.x) / natW) * 100}%`, height: `${(Math.abs(currentDraw.y - drawStart.y) / natH) * 100}%` }} />
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-4 flex flex-col">
                  {renderStepHeader("Manual Redaction", "Surgical precision for documents.")}
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar flex-1 mb-8">
                    {manualRegions.map((r, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-sm">
                        <span className="font-black text-xs text-slate-700 uppercase tracking-widest">Zone {i + 1}</span>
                        <button onClick={() => setManualRegions(prev => prev.filter((_, idx) => idx !== i))} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-8 pt-8 border-t border-slate-100">
                    <BlurStyleSelector value={blurType} onChange={setBlurType} options={blurStyles} />
                    <IntensitySlider value={blurStrength} onChange={setBlurStrength} />
                    <button onClick={() => applySelective(manualRegions)} disabled={isProcessing || manualRegions.length === 0} className="w-full py-5 bg-indigo-700 text-white rounded-3xl font-black text-xl shadow-2xl hover:-translate-y-1 transition-all">
                      Process Manual Zones
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 📍 STEP: RESULT */}
            {step === 'result' && result && (
              <div className="space-y-10 py-4 fade-slide-in">
                <div className="flex flex-col xl:flex-row gap-8">
                  <div className="flex-1 space-y-3">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-2">Original</span>
                    <div className="bg-slate-50 rounded-[3rem] overflow-hidden border-8 border-slate-100 shadow-xl relative aspect-square max-h-[500px] flex items-center justify-center">
                      {file?.type.startsWith('video/') ? (<video src={previewUrl!} className="w-full h-full object-contain" controls />) : (<img src={previewUrl!} className="w-full h-full object-contain" alt="Original" />)}
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex justify-between items-center px-2">
                      <span className="text-[10px] font-black uppercase text-green-600 tracking-widest">Result</span>
                      {result.is_video && <span className="bg-green-100 text-green-700 text-[10px] px-3 py-1 rounded-full font-black">VIDEO_READY</span>}
                    </div>
                    <div className="bg-green-50 rounded-[3rem] overflow-hidden border-8 border-green-400 shadow-2xl aspect-square max-h-[500px] flex items-center justify-center">
                      {result.is_video || (file && file.type.startsWith('video/')) ? (
                        <video src={result.blurredUrl || result.originalUrl} className="w-full h-full object-contain" controls />
                      ) : (
                        <img src={result.blurredUrl || result.originalUrl} className="w-full h-full object-contain" alt="Result" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-5 pt-8 border-t border-slate-100">
                  <a href={result.blurredUrl || result.originalUrl} target="_blank" rel="noopener noreferrer" download={file?.name.replace(/\.[^/.]+$/, "") + "_secure"}
                    className="flex-[2] min-w-[280px] py-6 bg-slate-900 text-white rounded-[2rem] font-black text-2xl text-center shadow-xl hover:-translate-y-1 hover:shadow-2xl transition-all flex items-center justify-center gap-4 group"
                  >
                    <Download className="w-8 h-8 group-hover:scale-110 transition-transform" /> Download {file?.type.startsWith('video/') ? 'Video' : 'Image'}
                  </a>
                  <button onClick={() => setStep('preview')} className="flex-1 px-8 py-6 bg-white border-4 border-slate-100 text-slate-800 rounded-[2rem] font-black text-lg hover:border-blue-500 transition-all flex items-center justify-center gap-3 active:scale-95">
                    <RotateCcw className="w-6 h-6" /> Redo
                  </button>
                  <button onClick={handleReset} className="px-10 py-6 bg-white border-4 border-slate-100 text-slate-400 rounded-[2rem] font-black text-lg hover:border-red-500 transition-all active:scale-95">
                    New Project
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feature Cards */}
      {step === 'upload' && (
        <div className="w-full max-w-7xl px-4 py-20 pb-40 grid grid-cols-1 md:grid-cols-3 gap-10">
          <FeatureCard icon={<UserX className="w-10 h-10 text-blue-600" />} title="Full Auto-Anonymize" desc="One-click processing for rapid identity protection across large datasets." />
          <FeatureCard icon={<Shield className="w-10 h-10 text-cyan-600" />} title="Dynamic Intensity" desc="Adjust blur strength from subtle to absolute to meet your specific legal requirements." />
          <FeatureCard icon={<CreditCard className="w-10 h-10 text-indigo-500" />} title="Selective Privacy" desc="Review detected identities and choose specifically who to keep or protect." />
        </div>
      )}
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────

function IntensitySlider({ value, onChange }: { value: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest italic opacity-60">Blur Intensity</span>
        <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">{value}px</span>
      </div>
      <input type="range" min="1" max="200" value={value} onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600 hover:accent-blue-500 transition-all" />
      <div className="flex justify-between px-1 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
        <span>Subtle</span>
        <span>Absolute</span>
      </div>
    </div>
  );
}

function ModeCard({ icon, title, desc, color, onClick, disabled, primary }: any) {
  const colors: any = {
    blue: "border-blue-100 bg-blue-50/20 hover:border-blue-500 hover:bg-blue-50/50 hover:shadow-2xl hover:shadow-blue-500/10",
    cyan: "border-cyan-100 bg-cyan-50/20 hover:border-cyan-500 hover:bg-cyan-50/50 hover:shadow-2xl hover:shadow-cyan-500/10",
    indigo: "border-indigo-100 bg-indigo-50/20 hover:border-indigo-500 hover:bg-indigo-50/50 hover:shadow-2xl hover:shadow-indigo-500/10",
  };
  const iconColors: any = { blue: "bg-blue-600 text-white", cyan: "bg-cyan-600 text-white", indigo: "bg-indigo-600 text-white" };
  return (
    <button onClick={onClick} disabled={disabled} className={`relative w-full p-8 text-left rounded-[2rem] border-4 transition-all duration-300 group overflow-hidden ${colors[color]} disabled:opacity-30 disabled:grayscale transition-all active:scale-95`}>
      {primary && <div className="absolute top-0 right-0 py-1.5 px-6 bg-blue-600 text-white font-black text-[10px] rounded-bl-2xl uppercase tracking-[0.2em] shadow-lg">Recommended</div>}
      <div className="flex flex-col gap-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-all ${iconColors[color]}`}>{icon}</div>
        <div><h3 className="text-xl font-black text-slate-800 tracking-tighter mb-1 uppercase">{title}</h3><p className="text-slate-500 text-sm font-bold leading-relaxed opacity-80">{desc}</p></div>
      </div>
    </button>
  );
}

function BlurStyleSelector({ value, onChange, options }: any) {
  return (
    <div className="space-y-4">
      <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] block ml-1 italic opacity-60">Engine_Preset</span>
      <div className="grid grid-cols-1 gap-2">
        {options.map((opt: any) => (
          <label key={opt.id} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${value === opt.id ? 'border-blue-600 bg-blue-600 text-white shadow-xl -translate-y-0.5' : 'border-slate-100 bg-white hover:border-blue-200 text-slate-600'}`}>
            <input type="radio" checked={value === opt.id} onChange={() => onChange(opt.id)} className="hidden" />
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${value === opt.id ? 'border-white bg-white' : 'border-slate-200'}`}>{value === opt.id && <div className="w-2 h-2 bg-blue-600 rounded-sm" />}</div>
            <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">{opt.icon} {opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: any) {
  return (
    <div className="p-10 rounded-[3rem] bg-white border-4 border-slate-100 shadow-2xl shadow-blue-500/5 hover:-translate-y-2 transition-all duration-500 group">
      <div className="w-20 h-20 rounded-3xl bg-slate-50 flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-4 uppercase">{title}</h3>
      <p className="text-slate-400 font-bold text-sm leading-relaxed mb-6 leading-relaxed">{desc}</p>
    </div>
  );
}
