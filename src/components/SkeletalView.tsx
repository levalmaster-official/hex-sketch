import React, { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { ElementNode, Bond, BondType, Annotation, AnnotationType, Tool, HistoryState, DrawingMode } from './chemistryTypes';
import { SkeletalToolbar } from './SkeletalToolbar';

const generateId = () => Math.random().toString(36).substring(2, 9);

// Isometric grid constants: bond length = 30px, matches benzene side length
const ISO_L = 30;

const snapToIsoGrid = (x: number, y: number): { x: number; y: number } => {
	// Triangular grid with 60° angles. Row height = ISO_L * sin(60°) ≈ ISO_L * 0.866
	const rowH = ISO_L * Math.sqrt(3) / 2; // ~45px
	const row = Math.round(y / rowH);
	const offset = (((row % 2) + 2) % 2) * (ISO_L / 2);
	const col = Math.round((x - offset) / ISO_L);
	return { x: col * ISO_L + offset, y: row * rowH };
};

const getInitialControlPoint = (start: {x: number, y: number}, end: {x: number, y: number}) => {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const len = Math.sqrt(dx*dx + dy*dy);
	if(len === 0) return {x: start.x, y: start.y};
	const nx = -dy/len;
	const ny = dx/len;
	const offset = Math.min(len/2, 40);
	return {
		x: start.x + dx/2 + nx * offset,
		y: start.y + dy/2 + ny * offset,
	};
};

// Distance from point to line segment
const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
	const dx = x2 - x1; const dy = y2 - y1;
	const lenSq = dx*dx + dy*dy;
	if (lenSq === 0) return Math.sqrt((px-x1)**2 + (py-y1)**2);
	let t = ((px - x1)*dx + (py - y1)*dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	return Math.sqrt((px - x1 - t*dx)**2 + (py - y1 - t*dy)**2);
};

// Find the closest endpoint of all bonds to a point (for chaining)
const findNearestBondEndpoint = (bonds: Bond[], x: number, y: number, threshold = 20): {x: number, y: number} | null => {
	let best: {x: number, y: number} | null = null;
	let bestDist = threshold;
	for (const b of bonds) {
		if (b.x1 === undefined) continue;
		for (const [ex, ey] of [[b.x1!, b.y1!], [b.x2!, b.y2!]] as [number, number][]) {
			const d = Math.sqrt((x-ex)**2 + (y-ey)**2);
			if (d < bestDist) { bestDist = d; best = {x: ex, y: ey}; }
		}
	}
	return best;
};

export const SkeletalView: React.FC<{initialData?: string, onChange?: (data: string) => void, readOnly?: boolean, mode: DrawingMode, setMode: (m: DrawingMode) => void, isBlank?: boolean}> = ({initialData, onChange, readOnly, mode, setMode, isBlank}) => {
	// Elements = heteroatoms only in skeletal mode
	const [elements, setElements] = useState<ElementNode[]>([]);
	// Bonds store direct x1,y1,x2,y2 coordinates
	const [bonds, setBonds] = useState<Bond[]>([]);
	const [annotations, setAnnotations] = useState<Annotation[]>([]);
	const [history, setHistory] = useState<HistoryState[]>([]);
	
	const [activeTool, setActiveTool] = useState<Tool>('bond_single');
	const [newElementText, setNewElementText] = useState('O');
	const [groupAlign, setGroupAlign] = useState<'start' | 'middle' | 'end'>('middle');
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [currentColor, setCurrentColor] = useState<string>('');
	
	const [scale, setScale] = useState(1);
	const [pan, setPan] = useState({x: 200, y: 200});
	
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	
	const [dragNodeId, setDragNodeId] = useState<string | null>(null);
	const [dragItemType, setDragItemType] = useState<'annotation' | 'control' | 'arrow_start' | 'arrow_end' | 'pan' | 'resize' | 'multi_drag' | null>(null);
	const [dragStartPos, setDragStartPos] = useState({x: 0, y: 0});
	const [dragInitialState, setDragInitialState] = useState<{elements: ElementNode[], annotations: Annotation[], bonds: Bond[]} | null>(null);
	const [selectionBox, setSelectionBox] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
	
	// Chain drawing state: where the current chain "tip" is
	const [chainEnd, setChainEnd] = useState<{x: number, y: number} | null>(null);
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
	const [drawingArrow, setDrawingArrow] = useState<{ start: {x: number, y: number}, current: {x: number, y: number} } | null>(null);

	const prevInitialData = useRef<string | undefined>(undefined);
	const isLoaded = useRef(false);

	useEffect(() => {
		if (initialData && initialData !== prevInitialData.current) {
			prevInitialData.current = initialData;
			try {
				const d = JSON.parse(initialData);
				setElements(d.elements || []);
				setBonds(d.bonds || []);
				setAnnotations(d.annotations || []);
				if (d.mode) setMode(d.mode);
				if (readOnly && d.bonds && d.bonds.length > 0) {
					const coords: number[] = [];
					d.bonds.forEach((b: Bond) => {
						if (b.x1 !== undefined) { coords.push(b.x1, b.x2!); }
					});
					d.elements?.forEach((e: ElementNode) => coords.push(e.x));
					if (coords.length > 0) {
						// Auto-center for readOnly
						const allX: number[] = [];
						const allY: number[] = [];
						d.bonds.forEach((b: Bond) => {
							if (b.x1 !== undefined) { allX.push(b.x1, b.x2!); allY.push(b.y1!, b.y2!); }
						});
						d.elements?.forEach((e: ElementNode) => { allX.push(e.x); allY.push(e.y); });
						if (allX.length > 0) {
							const minX = Math.min(...allX); const maxX = Math.max(...allX);
							const minY = Math.min(...allY); const maxY = Math.max(...allY);
							setPan({x: -(minX + maxX)/2 + 150, y: -(minY + maxY)/2 + 150});
						}
					}
				}
			} catch(e) {}
			setTimeout(() => { isLoaded.current = true; }, 0);
		} else if (!initialData) {
			isLoaded.current = true;
		}
	}, [initialData, readOnly]);

	useEffect(() => {
		if (isLoaded.current && onChange && !readOnly) {
			onChange(JSON.stringify({ mode, elements, bonds, annotations }, null, 2));
		}
	}, [mode, elements, bonds, annotations, onChange, readOnly]);

	const pushHistory = useCallback((e = elements, b = bonds, a = annotations) => {
		if (readOnly) return;
		setHistory(prev => [...prev.slice(-20), { elements: e, bonds: b, annotations: a }]);
	}, [elements, bonds, annotations, readOnly]);

	const handleUndo = useCallback(() => {
		if (readOnly) return;
		if (history.length > 0) {
			const last = history[history.length - 1];
			if (last) {
				setElements(last.elements);
				setBonds(last.bonds);
				setAnnotations(last.annotations);
				setHistory(prev => prev.slice(0, prev.length - 1));
				setSelectedIds([]);
				setChainEnd(null);
			}
		}
	}, [history, readOnly]);

	const handleDelete = useCallback(() => {
		if (readOnly) return;
		if (selectedIds.length === 0) return;
		pushHistory();
		setElements(elements.filter(e => !selectedIds.includes(e.id)));
		setBonds(bonds.filter(b => !selectedIds.includes(b.id)));
		setAnnotations(annotations.filter(a => !selectedIds.includes(a.id)));
		setSelectedIds([]);
	}, [selectedIds, elements, bonds, annotations, pushHistory, readOnly]);

	useEffect(() => {
		if (readOnly) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
			if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
			if (e.key === 'Escape') setChainEnd(null);
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [handleDelete, readOnly]);

	const handleTextChange = (newText: string) => {
		setNewElementText(newText);
		if (selectedIds.length === 1) {
			const id = selectedIds[0];
			const el = elements.find(e => e.id === id);
			if (el) {
				pushHistory();
				setElements(elements.map(e => e.id === id ? { ...e, text: newText } : e));
				return;
			}
			const ann = annotations.find(a => a.id === id);
			if (ann && (ann.type === 'text' || ann.type === 'charge' || ann.type === 'delta_charge' || ann.type.startsWith('reaction_'))) {
				pushHistory();
				setAnnotations(annotations.map(a => a.id === id ? { ...a, value: newText } : a));
			}
		}
	};

	const handleColorChange = (newColor: string) => {
		setCurrentColor(newColor);
		if (selectedIds.length > 0) {
			pushHistory();
			setElements(elements.map(e => selectedIds.includes(e.id) ? { ...e, color: newColor } : e));
			setBonds(bonds.map(b => selectedIds.includes(b.id) ? { ...b, color: newColor } : b));
			setAnnotations(annotations.map(a => selectedIds.includes(a.id) ? { ...a, color: newColor } : a));
		}
	};

	const getMouseCoords = (e: ReactMouseEvent | MouseEvent | React.WheelEvent) => {
		if (!svgRef.current) return { x: 0, y: 0 };
		const CTM = svgRef.current.getScreenCTM();
		if (!CTM) return { x: 0, y: 0 };
		const rawX = (e.clientX - CTM.e) / CTM.a;
		const rawY = (e.clientY - CTM.f) / CTM.d;
		return { x: (rawX - pan.x) / scale, y: (rawY - pan.y) / scale };
	};

	const handleWheel = (e: React.WheelEvent) => {
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
				setPan({x: newPanX, y: newPanY});
			}
		} else {
			setPan({x: pan.x - e.deltaX, y: pan.y - e.deltaY});
		}
	};
	
	useEffect(() => {
		const el = containerRef.current;
		const preventZoom = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
		if (el) el.addEventListener('wheel', preventZoom, { passive: false });
		return () => { if (el) el.removeEventListener('wheel', preventZoom); };
	}, []);

	const handlePointerDownCanvas = (e: ReactMouseEvent) => {
		if (activeTool === 'pan' || e.button === 1) { setDragItemType('pan'); return; }
		if (readOnly) return;
		
		const coords = getMouseCoords(e);

		if (activeTool === 'curly_arrow') {
			setDrawingArrow({ start: coords, current: coords });
			return;
		}
		if (activeTool === 'select') {
			if (!e.shiftKey) setSelectedIds([]);
			setSelectionBox({ start: coords, current: coords });
			setChainEnd(null);
			return;
		}

		const snap = snapToIsoGrid(coords.x, coords.y);

		// Chain/bond drawing: click creates a new bone segment
		if (activeTool === 'bond_single' || activeTool === 'bond_dotted') {
			const type = activeTool.replace('bond_', '') as BondType;
			// Snap to an existing endpoint if close enough
			const nearEnd = findNearestBondEndpoint(bonds, snap.x, snap.y, 15);
			const startPt = nearEnd || snap;
			if (chainEnd) {
				pushHistory();
				const nearest = findNearestBondEndpoint(bonds, chainEnd.x, chainEnd.y, 5);
				const from = nearest || chainEnd;
				setBonds(prev => [...prev, { id: generateId(), from: '', to: '', type, x1: from.x, y1: from.y, x2: snap.x, y2: snap.y, color: currentColor || undefined }]);
				setChainEnd(snap);
			} else {
				// Start a new chain: set the tip without drawing yet
				setChainEnd(startPt);
			}
			return;
		}

		// Place heteroatom at clicked position (nearest grid point)
		if (activeTool === 'heteroatom') {
			pushHistory();
			setElements(prev => [...prev, { id: generateId(), text: newElementText, x: snap.x, y: snap.y, color: currentColor || undefined, align: groupAlign }]);
			return;
		}

		// Text label
		if (activeTool === 'text') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'text', x: snap.x, y: snap.y, value: newElementText, color: currentColor || undefined }]);
			return;
		}

		// Benzene ring
		if (activeTool === 'benzene') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'benzene', x: snap.x, y: snap.y, color: currentColor || undefined, scale: 1 }]);
			return;
		}

		// Brackets
		if (activeTool === 'bracket_left') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'bracket_left', x: coords.x, y: coords.y, color: currentColor || undefined, scale: 1 }]);
			return;
		}
		if (activeTool === 'bracket_right') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'bracket_right', x: coords.x, y: coords.y, color: currentColor || undefined, scale: 1 }]);
			return;
		}

		// Charges & reaction symbols
		if (activeTool === 'charge_plus' || activeTool === 'charge_minus') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'charge', x: coords.x, y: coords.y, value: activeTool === 'charge_plus' ? '+' : '-', color: currentColor || undefined }]);
			return;
		}
		if (activeTool === 'delta_plus' || activeTool === 'delta_minus') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'delta_charge', x: coords.x, y: coords.y, value: activeTool === 'delta_plus' ? 'δ+' : 'δ-', color: currentColor || undefined }]);
			return;
		}
		if (activeTool === 'electron_pair_v') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'electron_pair', x: coords.x, y: coords.y, vertical: true, color: currentColor || undefined }]);
			return;
		}
		if (activeTool === 'electron_pair_h') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'electron_pair', x: coords.x, y: coords.y, vertical: false, color: currentColor || undefined }]);
			return;
		}
		if (activeTool === 'reaction_plus') {
			pushHistory();
			setAnnotations(prev => [...prev, { id: generateId(), type: 'reaction_plus', x: coords.x, y: coords.y, value: '+', color: currentColor || undefined }]);
			return;
		}
		if (activeTool === 'reaction_arrow' || activeTool === 'reaction_reversible') {
			setDrawingArrow({ start: coords, current: coords });
			return;
		}
	};

	// Click on an existing bond to upgrade its type (Double / Triple / Dotted)
	const handlePointerDownBond = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		// For heteroatom tool, let the event bubble to the canvas so it places at the snap point
		if (activeTool === 'heteroatom') return;
		e.stopPropagation();
		setChainEnd(null);
		if (activeTool === 'select') {
			if (!e.shiftKey) setSelectedIds([id]);
			else if (!selectedIds.includes(id)) setSelectedIds([...selectedIds, id]);
		} else if (activeTool === 'bond_double' || activeTool === 'bond_triple' || activeTool === 'bond_dotted') {
			const type = activeTool.replace('bond_', '') as BondType;
			pushHistory();
			setBonds(bonds.map(b => b.id === id ? { ...b, type } : b));
		} else if (activeTool === 'bond_single') {
			// Continue chain from nearest endpoint
			const bond = bonds.find(b => b.id === id);
			if (bond && bond.x2 !== undefined) {
				setChainEnd({ x: bond.x2, y: bond.y2! });
			}
		}
	};

	const handlePointerDownElement = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (e.button === 1 || activeTool === 'pan') { setDragItemType('pan'); return; }
		if (activeTool === 'select') {
			if (!e.shiftKey && !selectedIds.includes(id)) {
				setSelectedIds([id]);
				const el = elements.find(el => el.id === id);
				if (el) setNewElementText(el.text);
			} else if (e.shiftKey && !selectedIds.includes(id)) {
				setSelectedIds([...selectedIds, id]);
			}
			setDragNodeId(id);
			setDragItemType('multi_drag');
			setDragStartPos(getMouseCoords(e));
			setDragInitialState({ elements, annotations, bonds });
		}
	};

	const handlePointerDownAnnotation = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (e.button === 1 || activeTool === 'pan') { setDragItemType('pan'); return; }
		if (activeTool === 'select') {
			if (!e.shiftKey && !selectedIds.includes(id)) {
				setSelectedIds([id]);
				const ann = annotations.find(a => a.id === id);
				if (ann && (ann.type === 'text' || ann.type === 'charge' || ann.type === 'delta_charge' || ann.type.startsWith('reaction_'))) {
					setNewElementText(ann.value || '');
				}
			} else if (e.shiftKey && !selectedIds.includes(id)) {
				setSelectedIds([...selectedIds, id]);
			}
			setDragNodeId(id);
			setDragItemType('multi_drag');
			setDragStartPos(getMouseCoords(e));
			setDragInitialState({ elements, annotations, bonds });
		}
	};

	const handlePointerDownControl = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (activeTool === 'select') {
			if (!e.shiftKey && !selectedIds.includes(id)) setSelectedIds([id]);
			setDragNodeId(id);
			setDragItemType('control');
		}
	};

	const handlePointerMove = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') { setPan({ x: pan.x + e.movementX, y: pan.y + e.movementY }); return; }
		if (readOnly) return;
		const coords = getMouseCoords(e);
		const snap = snapToIsoGrid(coords.x, coords.y);
		setMousePos({ x: snap.x, y: snap.y });

		if (selectionBox) { setSelectionBox({ ...selectionBox, current: coords }); }

		if (dragNodeId && activeTool === 'select') {
			if (dragItemType === 'multi_drag' && dragInitialState) {
				const dx = coords.x - dragStartPos.x;
				const dy = coords.y - dragStartPos.y;
				setElements(dragInitialState.elements.map(el => selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
				setBonds(dragInitialState.bonds.map(b => selectedIds.includes(b.id) && b.x1 !== undefined ? { ...b, x1: b.x1! + dx, y1: b.y1! + dy, x2: b.x2! + dx, y2: b.y2! + dy } : b));
				setAnnotations(dragInitialState.annotations.map(a => selectedIds.includes(a.id) && !a.points ? { ...a, x: a.x + dx, y: a.y + dy } : a));
			} else if (dragItemType === 'control') {
				setAnnotations(annotations.map(a => a.id === dragNodeId ? { ...a, control: { x: coords.x, y: coords.y } } : a));
			} else if (dragItemType === 'arrow_start') {
				setAnnotations(annotations.map(a => a.id === dragNodeId && a.points ? { ...a, points: [{x: coords.x, y: coords.y}, a.points[1]!] } : a));
			} else if (dragItemType === 'arrow_end') {
				setAnnotations(annotations.map(a => a.id === dragNodeId && a.points ? { ...a, points: [a.points[0]!, {x: coords.x, y: coords.y}] } : a));
			} else if (dragItemType === 'resize') {
				const el = elements.find(e => e.id === dragNodeId);
				if (el) {
					const dx = coords.x - el.x; const dy = coords.y - el.y;
					const dist = Math.sqrt(dx*dx + dy*dy);
					setElements(elements.map(e => e.id === dragNodeId ? { ...e, scale: Math.max(0.5, dist / 11) } : e));
				} else {
					const ann = annotations.find(a => a.id === dragNodeId);
					if (ann) {
						const dx = coords.x - ann.x; const dy = coords.y - ann.y;
						const dist = Math.sqrt(dx*dx + dy*dy);
						setAnnotations(annotations.map(a => a.id === dragNodeId ? { ...a, scale: Math.max(0.5, dist / 11) } : a));
					}
				}
			}
		}
		if (drawingArrow) { setDrawingArrow({ ...drawingArrow, current: coords }); }
	};

	const handlePointerUp = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') { setDragItemType(null); return; }
		if (readOnly) return;
		if (dragNodeId) pushHistory();

		if (selectionBox) {
			const minX = Math.min(selectionBox.start.x, selectionBox.current.x);
			const maxX = Math.max(selectionBox.start.x, selectionBox.current.x);
			const minY = Math.min(selectionBox.start.y, selectionBox.current.y);
			const maxY = Math.max(selectionBox.start.y, selectionBox.current.y);
			const newSelected: string[] = [];
			elements.forEach(e => { if (e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY) newSelected.push(e.id); });
			bonds.forEach(b => {
				if (b.x1 !== undefined) {
					const cx = (b.x1 + b.x2!) / 2; const cy = (b.y1! + b.y2!) / 2;
					if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) newSelected.push(b.id);
				}
			});
			annotations.forEach(a => { if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) newSelected.push(a.id); });
			setSelectedIds(Array.from(new Set([...selectedIds, ...newSelected])));
			setSelectionBox(null);
		}

		if (dragNodeId) { setDragNodeId(null); setDragItemType(null); setDragInitialState(null); }
		
		if (drawingArrow) {
			pushHistory();
			const type = activeTool as AnnotationType;
			setAnnotations([...annotations, { 
				id: generateId(), type, x: drawingArrow.start.x, y: drawingArrow.start.y,
				points: [drawingArrow.start, drawingArrow.current],
				control: getInitialControlPoint(drawingArrow.start, drawingArrow.current),
				color: currentColor || undefined
			}]);
			setDrawingArrow(null);
			setActiveTool('select');
		}
	};

	// Render a single skeletal bond with correct double/triple styling
	const renderBond = (bond: Bond): React.ReactElement | null => {
		if (bond.x1 === undefined) return null;
		const x1 = bond.x1, y1 = bond.y1!, x2 = bond.x2!, y2 = bond.y2!;
		const dx = x2 - x1; const dy = y2 - y1;
		const len = Math.sqrt(dx*dx + dy*dy);
		if (len === 0) return null;
		const ux = dx / len; const uy = dy / len; // unit along bond
		const nx = -uy; const ny = ux; // normal (perpendicular)

		const isSelected = selectedIds.includes(bond.id) && !readOnly;
		const strokeCol = isSelected ? 'var(--color-red, #f02020)' : (bond.color || 'var(--text-normal)');
		const sw = isSelected ? 3 : 2;

		const OFFSET = 4; // perpendicular separation for double/triple
		const SHORT = 0.12; // fraction to shorten each end for inner lines
		const s = SHORT * len;

		const lc = 'round' as const; // strokeLinecap=round ensures lines meet cleanly at shared vertices
		const lines: React.ReactElement[] = [];
		if (bond.type === 'single') {
			lines.push(<line key="m" x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} strokeLinecap={lc} />);
		} else if (bond.type === 'dotted') {
			lines.push(<line key="m" x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} strokeLinecap={lc} strokeDasharray="4 4" />);
		} else if (bond.type === 'double') {
			lines.push(<line key="m" x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} strokeLinecap={lc} />);
			lines.push(<line key="d"
				x1={x1 + ux*s + nx*OFFSET} y1={y1 + uy*s + ny*OFFSET}
				x2={x2 - ux*s + nx*OFFSET} y2={y2 - uy*s + ny*OFFSET}
				stroke={strokeCol} strokeWidth={sw} strokeLinecap={lc} />);
		} else if (bond.type === 'triple') {
			lines.push(<line key="m" x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} strokeLinecap={lc} />);
			lines.push(<line key="da"
				x1={x1 + ux*s - nx*OFFSET} y1={y1 + uy*s - ny*OFFSET}
				x2={x2 - ux*s - nx*OFFSET} y2={y2 - uy*s - ny*OFFSET}
				stroke={strokeCol} strokeWidth={sw} strokeLinecap={lc} />);
			lines.push(<line key="db"
				x1={x1 + ux*s + nx*OFFSET} y1={y1 + uy*s + ny*OFFSET}
				x2={x2 - ux*s + nx*OFFSET} y2={y2 - uy*s + ny*OFFSET}
				stroke={strokeCol} strokeWidth={sw} strokeLinecap={lc} />);
		}

		return (
			<g key={bond.id} onPointerDown={e => handlePointerDownBond(e, bond.id)}
				style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : (activeTool.startsWith('bond_') ? 'pointer' : 'default') }}>
				{/* Fat invisible hit area */}
				<line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="16" />
				{lines}
			</g>
		);
	};

	// Compute viewBox for readOnly embed
	let viewBoxFull = undefined as string | undefined;
	if (readOnly) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const inc = (x: number, y: number) => {
			if (isNaN(x) || isNaN(y)) return;
			if (x < minX) minX = x; if (x > maxX) maxX = x;
			if (y < minY) minY = y; if (y > maxY) maxY = y;
		};
		bonds.forEach(b => { if (b.x1 !== undefined) { inc(b.x1, b.y1!); inc(b.x2!, b.y2!); } });
		elements.forEach(e => { inc(e.x - 20, e.y - 20); inc(e.x + 20, e.y + 20); });
		annotations.forEach(a => {
			if (a.points) a.points.forEach(p => inc(p.x, p.y));
			else { inc(a.x - 15, a.y - 15); inc(a.x + 15, a.y + 15); }
			if (a.control) inc(a.control.x, a.control.y);
		});
		if (minX !== Infinity) {
			const pad = 15;
			viewBoxFull = `${minX - pad} ${minY - pad} ${maxX - minX + pad*2} ${maxY - minY + pad*2}`;
		}
	}

	return (
		<div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: readOnly ? 'auto' : undefined }}>
			{!readOnly && (
				<SkeletalToolbar 
					mode={mode} setMode={setMode}
					activeTool={activeTool} setActiveTool={(tool) => { setActiveTool(tool); setChainEnd(null); }}
					handleUndo={handleUndo} canUndo={history.length > 0}
					selectedIds={selectedIds} handleDelete={handleDelete}
					newElementText={newElementText} setNewElementText={setNewElementText}
					handleTextChange={handleTextChange} showEditInput={selectedIds.length === 1}
					groupAlign={groupAlign} setGroupAlign={setGroupAlign}
					currentColor={currentColor} setCurrentColor={handleColorChange}
					isBlank={isBlank}
				/>
			)}

			<div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: readOnly ? 'transparent' : 'var(--background-primary)' }}>
				<svg 
					ref={svgRef} 
					width="100%"
					height={readOnly && viewBoxFull ? "auto" : "100%"}
					viewBox={viewBoxFull}
					style={{ touchAction: 'none', maxHeight: readOnly ? "500px" : undefined }}
					onPointerDown={handlePointerDownCanvas}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerLeave={handlePointerUp}
					onWheel={handleWheel}
				>
					<defs>
						<pattern id="isoGrid" width="60" height="51.9615" patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
							{/* Triangular lattice for ISO_L=30: rowH = 30*sqrt(3)/2 = 25.9808 */}
							{/* Even rows (offset=0): x = 0, 30, 60 */}
							<circle cx="0"  cy="0"       r="1.5" fill="var(--background-modifier-border)" />
							<circle cx="30" cy="0"       r="1.5" fill="var(--background-modifier-border)" />
							<circle cx="60" cy="0"       r="1.5" fill="var(--background-modifier-border)" />
							{/* Odd rows (offset=15): x = 15, 45 */}
							<circle cx="15" cy="25.9808" r="1.5" fill="var(--background-modifier-border)" />
							<circle cx="45" cy="25.9808" r="1.5" fill="var(--background-modifier-border)" />
							{/* Tile bottom edge */}
							<circle cx="0"  cy="51.9615" r="1.5" fill="var(--background-modifier-border)" />
							<circle cx="30" cy="51.9615" r="1.5" fill="var(--background-modifier-border)" />
							<circle cx="60" cy="51.9615" r="1.5" fill="var(--background-modifier-border)" />
						</pattern>
						<marker id="curlyhead" markerWidth="6" markerHeight="4.5" refX="5" refY="2.25" orient="auto">
							<polygon points="0 0, 6 2.25, 0 4.5" fill="var(--text-normal)" />
						</marker>
						<marker id="curlyhead-selected" markerWidth="6" markerHeight="4.5" refX="5" refY="2.25" orient="auto">
							<polygon points="0 0, 6 2.25, 0 4.5" fill="var(--color-red, #f02020)" />
						</marker>
						<marker id="curlyhead-color" markerWidth="6" markerHeight="4.5" refX="5" refY="2.25" orient="auto" markerUnits="strokeWidth">
							<polygon points="0 0, 6 2.25, 0 4.5" fill="context-stroke" />
						</marker>
					</defs>
					
					{/* Isometric dot grid background */}
					{!readOnly && <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#isoGrid)" style={{ cursor: activeTool === 'pan' ? 'grab' : (activeTool === 'bond_single' || activeTool === 'bond_dotted' ? 'crosshair' : 'default') }} />}

					<g transform={`translate(${readOnly ? 0 : pan.x}, ${readOnly ? 0 : pan.y}) scale(${readOnly ? 1 : scale})`}>

						{/* Selection box */}
						{selectionBox && (
							<rect
								x={Math.min(selectionBox.start.x, selectionBox.current.x)}
								y={Math.min(selectionBox.start.y, selectionBox.current.y)}
								width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
								height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
								fill="var(--color-blue, #2080f0)" fillOpacity="0.1" stroke="var(--color-blue, #2080f0)" strokeWidth="1" strokeDasharray="4"
							/>
						)}

						{/* Chain preview line while drawing */}
						{chainEnd && (activeTool === 'bond_single' || activeTool === 'bond_dotted') && (
							<line
								x1={chainEnd.x} y1={chainEnd.y}
								x2={mousePos.x} y2={mousePos.y}
								stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="6 4"
							/>
						)}

						{/* Curly arrow preview */}
						{drawingArrow && activeTool === 'curly_arrow' && (() => {
							const c = getInitialControlPoint(drawingArrow.start, drawingArrow.current);
							return <path
								d={`M ${drawingArrow.start.x} ${drawingArrow.start.y} Q ${c.x} ${c.y} ${drawingArrow.current.x} ${drawingArrow.current.y}`}
								fill="none" stroke={currentColor || 'var(--text-normal)'} strokeWidth="2" strokeDasharray="4"
								markerEnd="url(#curlyhead)"
							/>;
						})()}

						{/* Reaction arrow preview (straight) */}
						{drawingArrow && activeTool === 'reaction_arrow' && (
							<line
								x1={drawingArrow.start.x} y1={drawingArrow.start.y}
								x2={drawingArrow.current.x} y2={drawingArrow.current.y}
								stroke={currentColor || 'var(--text-normal)'} strokeWidth="2" strokeDasharray="4"
								markerEnd="url(#curlyhead)"
							/>
						)}
						{drawingArrow && activeTool === 'reaction_reversible' && (() => {
							const dx = drawingArrow.current.x - drawingArrow.start.x;
							const dy = drawingArrow.current.y - drawingArrow.start.y;
							const len = Math.sqrt(dx*dx+dy*dy) || 1;
							const nx2 = -dy/len*3; const ny2 = dx/len*3;
							return <g>
								<line x1={drawingArrow.start.x+nx2} y1={drawingArrow.start.y+ny2} x2={drawingArrow.current.x+nx2} y2={drawingArrow.current.y+ny2}
									stroke={currentColor || 'var(--text-normal)'} strokeWidth="1.5" strokeDasharray="4" markerEnd="url(#curlyhead)" />
								<line x1={drawingArrow.current.x-nx2} y1={drawingArrow.current.y-ny2} x2={drawingArrow.start.x-nx2} y2={drawingArrow.start.y-ny2}
									stroke={currentColor || 'var(--text-normal)'} strokeWidth="1.5" strokeDasharray="4" markerEnd="url(#curlyhead)" />
							</g>;
						})()}

						{/* Bonds */}
						{bonds.map(renderBond)}

						{/* Heteroatoms */}
						{elements.map(el => {
							const isSelected = selectedIds.includes(el.id) && !readOnly;
							return (
								<g key={el.id} transform={`translate(${el.x}, ${el.y}) scale(${el.scale || 1})`}
									onPointerDown={(e) => handlePointerDownElement(e, el.id)}
									style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
									{/* Opaque background rect to fully erase bond behind label (fixes O letter hole) */}
									{(() => {
										const w = Math.max(16, (el.text || '').length * 10 + 4);
										let rx = -w / 2;
										if (el.align === 'start') rx = -w + 4;
										else if (el.align === 'end') rx = -4;
										return <rect x={rx} y={-10} width={w} height={20} fill="var(--background-primary)" rx="2" />;
									})()}
									<text textAnchor={el.align || "middle"} dx={el.align === 'start' ? -6 : el.align === 'end' ? 6 : 0}
										dominantBaseline="central" fill={el.color || "var(--text-normal)"}
										fontWeight="bold" fontSize="16px" style={{ userSelect: 'none' }}>{el.text}</text>
									{isSelected && activeTool === 'select' && (
										<rect x="8" y="8" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize"
											onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(el.id); }} />
									)}
								</g>
							);
						})}

						{/* Annotations */}
						{annotations.map(ann => {
							const isSelected = selectedIds.includes(ann.id) && !readOnly;
							const strokeColor = isSelected ? "var(--color-red, #f02020)" : (ann.color || "var(--text-normal)");

							if (ann.type === 'benzene') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && <rect x="-35" y="-35" width="70" height="70" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<path d="M 0 -30 L 25.98 -15 L 25.98 15 L 0 30 L -25.98 15 L -25.98 -15 Z" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" strokeLinejoin="round" />
										<circle cx="0" cy="0" r="18" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" />
										{isSelected && activeTool === 'select' && (
											<rect x="25" y="20" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'bracket_left') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && <rect x="-15" y="-35" width="25" height="70" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<path d="M 0 -30 L -10 -30 L -10 30 L 0 30" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" strokeLinecap="square" />
										{isSelected && activeTool === 'select' && (
											<rect x="-5" y="25" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'bracket_right') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && <rect x="-10" y="-35" width="25" height="70" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<path d="M 0 -30 L 10 -30 L 10 30 L 0 30" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" strokeLinecap="square" />
										{isSelected && activeTool === 'select' && (
											<rect x="5" y="25" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'reaction_arrow' && ann.points && ann.points.length >= 2) {
								const pts = ann.points;
								return (
									<g key={ann.id}>
										<line x1={pts[0]!.x} y1={pts[0]!.y} x2={pts[1]!.x} y2={pts[1]!.y}
											stroke={strokeColor} strokeWidth={isSelected ? 3 : 2}
											markerEnd={isSelected ? 'url(#curlyhead-selected)' : (ann.color ? 'url(#curlyhead-color)' : 'url(#curlyhead)')}
											onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)}
											style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : 'default', pointerEvents: 'stroke' }}
										/>
										{isSelected && activeTool === 'select' && (
											<>
												<circle cx={pts[0]!.x} cy={pts[0]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_start'); }} />
												<circle cx={pts[1]!.x} cy={pts[1]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_end'); }} />
											</>
										)}
									</g>
								);
							} else if (ann.type === 'reaction_reversible' && ann.points && ann.points.length >= 2) {
								const pts = ann.points;
								const dx2 = pts[1]!.x - pts[0]!.x; const dy2 = pts[1]!.y - pts[0]!.y;
								const len2 = Math.sqrt(dx2*dx2+dy2*dy2) || 1;
								const nx2 = -dy2/len2*3.5; const ny2 = dx2/len2*3.5;
								return (
									<g key={ann.id} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : 'default' }}>
										<line x1={pts[0]!.x+nx2} y1={pts[0]!.y+ny2} x2={pts[1]!.x+nx2} y2={pts[1]!.y+ny2}
											stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.5}
											markerEnd={isSelected ? 'url(#curlyhead-selected)' : (ann.color ? 'url(#curlyhead-color)' : 'url(#curlyhead)')} />
										<line x1={pts[1]!.x-nx2} y1={pts[1]!.y-ny2} x2={pts[0]!.x-nx2} y2={pts[0]!.y-ny2}
											stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.5}
											markerEnd={isSelected ? 'url(#curlyhead-selected)' : (ann.color ? 'url(#curlyhead-color)' : 'url(#curlyhead)')} />
										{isSelected && activeTool === 'select' && (
											<>
												<circle cx={pts[0]!.x} cy={pts[0]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_start'); }} />
												<circle cx={pts[1]!.x} cy={pts[1]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_end'); }} />
											</>
										)}
									</g>
								);
							} else if (ann.type === 'charge' || ann.type === 'delta_charge' || ann.type === 'reaction_plus') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										<text textAnchor="middle" dominantBaseline="central" fill={ann.color || "var(--text-normal)"} fontSize="14px" fontWeight="bold" style={{ userSelect: 'none' }}>{ann.value}</text>
										{isSelected && activeTool === 'select' && (
											<rect x="8" y="8" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'electron_pair') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										<rect x="-8" y="-8" width="16" height="16" fill={isSelected ? strokeColor : "transparent"} opacity="0.3" rx="4" />
										{ann.vertical ? (
											<><circle cx="0" cy="-3.5" r="2.5" fill={ann.color || "var(--text-normal)"} /><circle cx="0" cy="3.5" r="2.5" fill={ann.color || "var(--text-normal)"} /></>
										) : (
											<><circle cx="-3.5" cy="0" r="2.5" fill={ann.color || "var(--text-normal)"} /><circle cx="3.5" cy="0" r="2.5" fill={ann.color || "var(--text-normal)"} /></>
										)}
									</g>
								);
							} else if (ann.type === 'text') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && <rect x="-10" y="-10" width="20" height="20" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<text textAnchor="middle" dominantBaseline="central" fill={ann.color || "var(--text-normal)"} fontWeight="bold" fontSize="16px" style={{ userSelect: 'none' }}>{ann.value}</text>
									</g>
								);
							} else if (ann.type === 'curly_arrow' && ann.points && ann.points.length >= 2) {
								const pts: any = ann.points;
								const c = ann.control || getInitialControlPoint(pts[0], pts[1]);
								return (
									<g key={ann.id}>
										<path
											d={`M ${pts[0].x} ${pts[0].y} Q ${c.x} ${c.y} ${pts[1].x} ${pts[1].y}`}
											fill="none" stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"}
											markerEnd={isSelected ? "url(#curlyhead-selected)" : (ann.color ? "url(#curlyhead-color)" : "url(#curlyhead)")}
											onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)}
											style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default', pointerEvents: 'stroke' }}
										/>
										{isSelected && activeTool === 'select' && (
											<>
												<line x1={pts[0].x} y1={pts[0].y} x2={c.x} y2={c.y} stroke="var(--text-muted)" strokeDasharray="2 2" />
												<line x1={pts[1].x} y1={pts[1].y} x2={c.x} y2={c.y} stroke="var(--text-muted)" strokeDasharray="2 2" />
												<circle cx={c.x} cy={c.y} r="6" fill="var(--color-blue, #2080f0)" cursor="move" onPointerDown={(e) => handlePointerDownControl(e, ann.id)} />
												<circle cx={pts[0].x} cy={pts[0].y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_start'); }} />
												<circle cx={pts[1].x} cy={pts[1].y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_end'); }} />
											</>
										)}
									</g>
								);
							}
							return null;
						})}
					</g>
				</svg>
			</div>
		</div>
	);
};
