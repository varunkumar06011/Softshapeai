import { useEffect, useRef } from "react";
import { renderToCanvas } from "../../services/creativeEngine";

export default function CreativeCanvas({ config, uploadUrl, className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !uploadUrl) return;
    
    const foodImg = new Image();
    const bgImg = new Image();
    
    let loadedCount = 0;
    const onImageLoad = () => {
      loadedCount++;
      if (loadedCount === 2) {
        renderToCanvas(canvasRef.current, config, foodImg, bgImg);
      }
    };

    foodImg.crossOrigin = "anonymous";
    foodImg.src = uploadUrl;
    foodImg.onload = onImageLoad;

    bgImg.crossOrigin = "anonymous";
    bgImg.src = config.bgAsset || '';
    bgImg.onload = onImageLoad;
    bgImg.onerror = () => {
      // Fallback if background fails
      loadedCount++;
      if (loadedCount === 2) {
        renderToCanvas(canvasRef.current, config, foodImg, null);
      }
    };
  }, [config, uploadUrl, renderToCanvas]);

  return <canvas ref={canvasRef} width={800} height={1000} className={className} style={{ width: '100%', height: 'auto', display: 'block' }} />;
}
