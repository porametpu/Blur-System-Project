"use client";

import React, { useState, useEffect } from 'react';

interface VideoPreviewProps {
    file: File;
}

export default function VideoPreview({ file }: VideoPreviewProps) {
    const [url, setUrl] = useState<string>('');

    useEffect(() => {
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [file]);

    return (
        <div className="rounded-2xl overflow-hidden border border-slate-200 relative bg-slate-900 aspect-video w-full flex items-center justify-center shadow-inner">
            {url ? (
                <video
                    src={url}
                    controls
                    className="w-full h-full object-contain"
                />
            ) : (
                <div className="text-slate-500 animate-pulse font-medium">Loading Video Preview...</div>
            )}

            <div className="absolute top-4 left-4 flex gap-2 pointer-events-none">
                <span className="bg-slate-900/80 backdrop-blur-md text-xs font-bold px-3 py-1.5 rounded-lg text-white inline-flex items-center gap-2 border border-white/10 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Video Preview
                </span>
            </div>
        </div>
    );
}
