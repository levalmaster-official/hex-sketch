import { useState, useCallback, useRef, useEffect } from 'react';
import { ElementNode, Bond, Annotation, HistoryState, DrawingMode } from '../chemistryTypes';

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const snapToGrid = (n: number, size = 20) => Math.round(n / size) * size;

export const snapToIsoGrid = (x: number, y: number) => {
	const gw = 60, gh = 51.9615;
	const px = Math.round(x / 30) * 30;
	const py = Math.round(y / gh) * gh;
	const poy = Math.round((y - gh/2) / gh) * gh + gh/2;
	const rowType = Math.round(y / (gh/2)) % 2;
	if (rowType === 0) return { x: Math.round(x / 30) * 30, y: py };
	return { x: Math.round((x - 15) / 30) * 30 + 15, y: poy };
};

export const getInitialControlPoint = (start: {x:number,y:number}, end: {x:number,y:number}) => {
	const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
	const dx = end.x - start.x; const dy = end.y - start.y;
	const len = Math.sqrt(dx*dx + dy*dy) || 1;
	return { x: mid.x - dy / len * 30, y: mid.y + dx / len * 30 };
};

interface UseCanvasProps {
	initialData?: string;
	onChange?: (data: string) => void;
	readOnly?: boolean;
	mode: DrawingMode;
}

export const useCanvas = ({ initialData, onChange, readOnly, mode }: UseCanvasProps) => {
	const [elements, setElements] = useState<ElementNode[]>([]);
	const [bonds, setBonds] = useState<Bond[]>([]);
	const [annotations, setAnnotations] = useState<Annotation[]>([]);
	const [history, setHistory] = useState<HistoryState[]>([]);
	const isLoaded = useRef(false);
	const prevInitialData = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (initialData && initialData !== prevInitialData.current) {
			prevInitialData.current = initialData;
			try {
				const d = JSON.parse(initialData);
				setElements(d.elements || []);
				setBonds(d.bonds || []);
				setAnnotations(d.annotations || []);
			} catch (e) {}
			setTimeout(() => { isLoaded.current = true; }, 0);
		} else if (!initialData) {
			isLoaded.current = true;
		}
	}, [initialData]);

	useEffect(() => {
		if (isLoaded.current && onChange && !readOnly) {
			onChange(JSON.stringify({ mode, elements, bonds, annotations }, null, 2));
		}
	}, [mode, elements, bonds, annotations, onChange, readOnly]);

	const pushHistory = useCallback((e = elements, b = bonds, a = annotations) => {
		if (readOnly) return;
		setHistory(prev => [...prev.slice(-20), { elements: e, bonds: b, annotations: a }]);
	}, [elements, bonds, annotations, readOnly]);

	const undo = useCallback(() => {
		if (readOnly || history.length === 0) return;
		const last = history[history.length - 1];
		if (last) {
			setElements(last.elements);
			setBonds(last.bonds);
			setAnnotations(last.annotations);
			setHistory(prev => prev.slice(0, -1));
		}
	}, [history, readOnly]);

	const deleteSelection = useCallback((selectedIds: string[]) => {
		if (readOnly || selectedIds.length === 0) return;
		pushHistory();
		setElements(prev => prev.filter(e => !selectedIds.includes(e.id)));
		setBonds(prev => prev.filter(b => !selectedIds.includes(b.id) && !selectedIds.includes(b.from) && !selectedIds.includes(b.to)));
		setAnnotations(prev => prev.filter(a => !selectedIds.includes(a.id)));
	}, [pushHistory, readOnly]);

	return {
		elements, setElements,
		bonds, setBonds,
		annotations, setAnnotations,
		history, pushHistory,
		undo, deleteSelection
	};
};
