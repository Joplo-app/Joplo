import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useRootAttrs, type NodeProps } from '@joplo-app/kit/renderer';
import { axisOffset, fittedSize, isRegionRect, regionBox, type ImageFit, type ImagePlane } from './image-geometry.ts';

const Plane = createContext<ImagePlane | null>(null);

type RegionImageProps = { src: string; fit: ImageFit; position: string; children: ReactNode; hold?: () => () => void };
export function RegionImage({ src, fit, position, children, hold }: RegionImageProps) {
  const image = useRef<HTMLImageElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [plane, setPlane] = useState<ImagePlane | null>(null);
  const holdRef = useRef(hold);
  holdRef.current = hold;

  useLayoutEffect(() => {
    const img = image.current!;
    const marker = probe.current!;
    const release = img.complete ? undefined : holdRef.current?.();
    const measure = () => {
      if (!img.naturalWidth || !img.naturalHeight) { setPlane(null); return; }
      // Computed content sizes preserve subpixels and are independent of the stage camera transform.
      const style = getComputedStyle(img);
      const width = parseFloat(style.width), height = parseFloat(style.height);
      if (!(width > 0 && height > 0)) { setPlane(null); return; }
      const size = fittedSize(width, height, img.naturalWidth, img.naturalHeight, fit);
      marker.style.backgroundPosition = style.objectPosition;
      const css = getComputedStyle(marker);
      marker.style.left = axisOffset(css.backgroundPositionX, width - size.width);
      marker.style.top = axisOffset(css.backgroundPositionY, height - size.height);
      setPlane({ ...size, x: parseFloat(css.left), y: parseFloat(css.top), viewportWidth: width, viewportHeight: height });
    };
    const settled = () => { measure(); release?.(); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(img);
    img.addEventListener('load', settled);
    img.addEventListener('error', settled);
    return () => { observer.disconnect(); img.removeEventListener('load', settled); img.removeEventListener('error', settled); release?.(); };
  }, [src, fit, position]);

  return <div style={{ position: 'relative', height: '100%' }}>
    <img ref={image} src={src} alt="" draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: fit, objectPosition: position }} />
    <span ref={probe} aria-hidden style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: 0, height: 0 }} />
    <Plane.Provider value={plane}>{children}</Plane.Provider>
  </div>;
}

export function ImageRegion({ node, p }: NodeProps) {
  const plane = useContext(Plane);
  const attrs = useRootAttrs(node);
  const bounds = plane && isRegionRect(p.rect) ? regionBox(plane, p.rect) : null;
  return bounds ? <span {...attrs} aria-label={typeof p.label === 'string' ? p.label : undefined}
    style={{ position: 'absolute', pointerEvents: 'none', ...bounds }} /> : null;
}
