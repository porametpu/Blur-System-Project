import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileImage, FileVideo, Loader2 } from 'lucide-react';

interface UploadAreaProps {
    onUpload: (file: File) => void;
}

export default function UploadArea({ onUpload }: UploadAreaProps) {
    const [isHovered, setIsHovered] = useState(false);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            onUpload(acceptedFiles[0]);
        }
    }, [onUpload]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
            'video/*': ['.mp4', '.mov', '.avi']
        },
        maxFiles: 1
    });

    return (
        <div
            {...getRootProps()}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={`relative overflow-hidden w-full max-w-2xl mx-auto rounded-3xl border-2 border-dashed transition-all duration-300 ease-in-out cursor-pointer group glass-panel flex flex-col items-center justify-center min-h-[300px] shadow-sm bg-white
        ${isDragActive ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-md'}`}
        >
            <input {...getInputProps()} />

            {/* Background glow effect on hover */}
            <div className={`absolute inset-0 bg-gradient-to-tr from-blue-500/5 to-cyan-500/5 opacity-0 transition-opacity duration-500 ${isHovered || isDragActive ? 'opacity-100' : ''}`} />

            <div className="z-10 flex flex-col items-center gap-4 text-center p-8">
                <div className={`p-4 rounded-full bg-white shadow-sm border border-slate-100 transition-transform duration-300 ${isDragActive ? 'scale-110 bg-blue-50 border-blue-200' : 'group-hover:-translate-y-2 group-hover:shadow-md group-hover:border-blue-100 group-hover:bg-blue-50/50'}`}>
                    <UploadCloud className={`w-10 h-10 transition-colors ${isDragActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} />
                </div>

                <div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-2">
                        {isDragActive ? 'Drop your file here' : 'Drag & Drop your media'}
                    </h3>
                    <p className="text-sm text-slate-500 max-w-xs mx-auto">
                        Upload images or videos to automatically detect and blur sensitive information.
                    </p>
                </div>

                <div className="flex gap-4 mt-4 text-xs font-medium text-slate-600">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 shadow-sm">
                        <FileImage className="w-3.5 h-3.5 text-blue-500" /> Images up to 20MB
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 shadow-sm">
                        <FileVideo className="w-3.5 h-3.5 text-rose-500" /> Videos up to 100MB
                    </div>
                </div>
            </div>
        </div>
    );
}
