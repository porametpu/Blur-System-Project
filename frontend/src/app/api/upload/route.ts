import { NextRequest, NextResponse } from 'next/server';
import cloudinary from '@/lib/cloudinary';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const mode = formData.get('mode') as string || 'auto'; // auto | detect | selective
        const regions = formData.get('regions') as string || '[]';
        const blurType = formData.get('blurType') as string || 'gaussian';
        const blurStrength = formData.get('blurStrength') as string || '50';
        const timestamp = formData.get('timestamp') as string || '0';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Convert file to buffer for Cloudinary
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload original to Cloudinary
        const originalUpload = await new Promise<any>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'blur_system/originals', resource_type: 'auto' },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(buffer);
        });

        const baseUrl = process.env.FASTAPI_URL || 'http://localhost:8000';

        // ─── MODE: DETECT (return face bounding boxes) ───
        if (mode === 'detect') {
            const aiForm = new FormData();
            aiForm.append('file', file);
            aiForm.append('timestamp', timestamp);

            try {
                const resp = await fetch(`${baseUrl}/api/detect-faces`, {
                    method: 'POST',
                    body: aiForm as any,
                });
                if (resp.ok) {
                    const data = await resp.json();
                    return NextResponse.json({
                        originalUrl: originalUpload.secure_url,
                        detections: data.detections,
                        imageWidth: data.image_width,
                        imageHeight: data.image_height,
                        count: data.count,
                    });
                }
            } catch (e) {
                console.error('Detect faces error:', e);
            }
            return NextResponse.json({
                originalUrl: originalUpload.secure_url,
                detections: [],
                count: 0,
            });
        }

        // ─── MODE: SELECTIVE (blur specific regions) ───
        if (mode === 'selective') {
            const aiForm = new FormData();
            aiForm.append('file', file);
            aiForm.append('regions', regions);
            aiForm.append('blur_type', blurType);
            aiForm.append('blur_strength', blurStrength);
            aiForm.append('timestamp', timestamp);

            try {
                const resp = await fetch(`${baseUrl}/api/selective-blur`, {
                    method: 'POST',
                    body: aiForm as any,
                });
                if (resp.ok) {
                    const data = await resp.json();
                    return NextResponse.json({
                        originalUrl: originalUpload.secure_url,
                        blurredUrl: data.blurred_url,
                        status: 'completed',
                        is_video: data.is_video,
                    });
                }
                const errorMsg = await resp.text();
                return NextResponse.json({ error: `Selective Blur Error: ${errorMsg}` }, { status: 502 });
            } catch (e) {
                console.error('Selective blur network error:', e);
                return NextResponse.json({ error: 'Connection to AI failed' }, { status: 503 });
            }
        }

        // ─── MODE: AUTO (blur all detected faces) ───
        if (mode === 'auto') {
            const aiForm = new FormData();
            aiForm.append('file', file);
            aiForm.append('blur_type', blurType);
            aiForm.append('blur_strength', blurStrength);

            try {
                const resp = await fetch(`${baseUrl}/api/process-image`, {
                    method: 'POST',
                    body: aiForm as any,
                });
                if (resp.ok) {
                    const data = await resp.json();
                    return NextResponse.json({
                        originalUrl: originalUpload.secure_url,
                        blurredUrl: data.blurred_url || originalUpload.secure_url,
                        status: 'completed',
                        facesDetected: data.faces_detected || 0,
                        is_video: data.is_video,
                    });
                } else {
                    const errorMsg = await resp.text();
                    console.error('Auto blur API error:', errorMsg);
                    return NextResponse.json({ error: `AI Engine Error: ${errorMsg}` }, { status: 502 });
                }
            } catch (e: any) {
                console.error('Auto process fetch error:', e);
                return NextResponse.json({ error: 'AI Connection Failed' }, { status: 503 });
            }
        }

        return NextResponse.json({ error: 'Invalid Mode' }, { status: 400 });
    } catch (error: any) {
        console.error('Global Upload Error:', error?.message);
        return NextResponse.json({ error: error?.message || 'Server Error' }, { status: 500 });
    }
}
