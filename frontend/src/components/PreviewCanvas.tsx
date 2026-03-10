"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';

interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
    id: string;
}

interface PreviewCanvasProps {
    file: File;
    onRectanglesChange?: (rects: Rectangle[]) => void;
}

export default function PreviewCanvas({ file, onRectanglesChange }: PreviewCanvasProps) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [rectangles, setRectangles] = useState<Rectangle[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [selectedId, selectShape] = useState<string | null>(null);

    const stageRef = useRef<any>(null);
    const layerRef = useRef<any>(null);
    const trRef = useRef<any>(null);

    useEffect(() => {
        const img = new window.Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            setImage(img);
        };
    }, [file]);

    useEffect(() => {
        if (onRectanglesChange) {
            onRectanglesChange(rectangles);
        }
    }, [rectangles, onRectanglesChange]);

    const handleMouseDown = (e: any) => {
        const clickedOnEmpty = e.target.name() === 'backgroundImage';
        if (clickedOnEmpty) {
            selectShape(null);

            const pos = e.target.getStage().getPointerPosition();
            setIsDrawing(true);
            setRectangles([...rectangles, { x: pos.x, y: pos.y, width: 0, height: 0, id: Date.now().toString() }]);
        }
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing) return;

        const stage = e.target.getStage();
        const point = stage.getPointerPosition();

        setRectangles(prevRects => {
            const lastRect = { ...prevRects[prevRects.length - 1] };
            lastRect.width = point.x - lastRect.x;
            lastRect.height = point.y - lastRect.y;

            const newRects = [...prevRects];
            newRects[newRects.length - 1] = lastRect;
            return newRects;
        });
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
    };

    // Dimensions setup to fit container width
    const containerWidth = 600; // Mocked container width
    const scale = image ? containerWidth / image.width : 1;
    const containerHeight = image ? image.height * scale : 400;

    useEffect(() => {
        if (selectedId && trRef.current) {
            const node = layerRef.current.findOne('#' + selectedId);
            if (node) {
                trRef.current.nodes([node]);
                trRef.current.getLayer().batchDraw();
            }
        }
    }, [selectedId]);

    return (
        <div className="border border-white/10 rounded-xl overflow-hidden bg-black flex justify-center w-full">
            {image && (
                <Stage
                    width={containerWidth}
                    height={containerHeight}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    ref={stageRef}
                >
                    <Layer ref={layerRef}>
                        <KonvaImage
                            image={image}
                            width={containerWidth}
                            height={containerHeight}
                            name="backgroundImage"
                        />
                        {rectangles.map((rect, i) => (
                            <Rect
                                key={rect.id}
                                id={rect.id}
                                x={rect.x}
                                y={rect.y}
                                width={rect.width}
                                height={rect.height}
                                fill="rgba(0,0,0,0.5)"
                                stroke="#6366f1"
                                strokeWidth={2}
                                draggable
                                onClick={() => selectShape(rect.id)}
                                onTap={() => selectShape(rect.id)}
                                onDragEnd={(e) => {
                                    const newRects = [...rectangles];
                                    newRects[i] = {
                                        ...newRects[i],
                                        x: e.target.x(),
                                        y: e.target.y(),
                                    };
                                    setRectangles(newRects);
                                }}
                                onTransformEnd={(e) => {
                                    const node = e.target;
                                    const scaleX = node.scaleX();
                                    const scaleY = node.scaleY();
                                    node.scaleX(1);
                                    node.scaleY(1);

                                    const newRects = [...rectangles];
                                    newRects[i] = {
                                        ...newRects[i],
                                        x: node.x(),
                                        y: node.y(),
                                        width: Math.max(5, node.width() * scaleX),
                                        height: Math.max(5, node.height() * scaleY),
                                    };
                                    setRectangles(newRects);
                                }}
                            />
                        ))}
                        {selectedId && (
                            <Transformer
                                ref={trRef}
                                boundBoxFunc={(oldBox, newBox) => {
                                    if (newBox.width < 5 || newBox.height < 5) {
                                        return oldBox;
                                    }
                                    return newBox;
                                }}
                            />
                        )}
                    </Layer>
                </Stage>
            )}
        </div>
    );
}
