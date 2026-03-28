import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react';

export const useNavigation = (svgRef: React.RefObject<SVGSVGElement | null>, containerRef: React.RefObject<HTMLDivElement | null>, readOnly?: boolean) => {
	const [scale, setScale] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });

	const getMouseCoords = (e: ReactMouseEvent | MouseEvent | ReactWheelEvent) => {
		if (!svgRef.current) return { x: 0, y: 0 };
		const CTM = svgRef.current.getScreenCTM();
		if (!CTM) return { x: 0, y: 0 };
		const rawX = (e.clientX - CTM.e) / CTM.a;
		const rawY = (e.clientY - CTM.f) / CTM.d;
		return { x: (rawX - pan.x) / scale, y: (rawY - pan.y) / scale };
	};

	const handleWheel = (e: ReactWheelEvent) => {
		if (e.ctrlKey || e.metaKey || e.shiftKey) {
			const zoomDir = e.deltaY > 0 ? 0.9 : 1.1;
			const newScale = Math.min(Math.max(0.1, scale * zoomDir), 5);
			if (svgRef.current) {
				const rect = svgRef.current.getBoundingClientRect();
				const rawX = e.clientX - rect.left;
				const rawY = e.clientY - rect.top;
				const newPanX = rawX - (rawX - pan.x) * (newScale / scale);
				const newPanY = rawY - (rawY - pan.y) * (newScale / scale);
				setScale(newScale);
				setPan({ x: newPanX, y: newPanY });
			}
		} else {
			setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
		}
	};

	useEffect(() => {
		const el = containerRef.current;
		const preventZoom = (e: WheelEvent) => {
			if (e.ctrlKey || e.metaKey) e.preventDefault();
		};
		if (el) el.addEventListener('wheel', preventZoom, { passive: false });
		return () => { if (el) el.removeEventListener('wheel', preventZoom); };
	}, [containerRef]);

	return { scale, setScale, pan, setPan, getMouseCoords, handleWheel };
};
