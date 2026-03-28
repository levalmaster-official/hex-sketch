import React, { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { ElementNode, Bond, BondType, Annotation, AnnotationType, Tool, HistoryState, DrawingMode } from './chemistryTypes';
import { SkeletalToolbar } from './SkeletalToolbar';

const generateId = () => Math.random().toString(36).substring(2, 9);

const ISO_L = 30;
const ISO_DX = ISO_L * Math.sqrt(3); // ~51.9615
const ISO_DY = ISO_L / 2; // 15

const snapToIsoGrid = (x: number, y: number) => {
	const r1 = Math.floor(y / ISO_DY);
	const r2 = r1 + 1;
	
	const offset1 = (Math.abs(r1) % 2 === 1) ? ISO_DX / 2 : 0;
	const c1 = Math.round((x - offset1) / ISO_DX);
	const x1 = c1 * ISO_DX + offset1;
	const y1 = r1 * ISO_DY;

	const offset2 = (Math.abs(r2) % 2 === 1) ? ISO_DX / 2 : 0;
	const c2 = Math.round((x - offset2) / ISO_DX);
	const x2 = c2 * ISO_DX + offset2;
	const y2 = r2 * ISO_DY;

	const d1 = (x - x1)*(x - x1) + (y - y1)*(y - y1);
	const d2 = (x - x2)*(x - x2) + (y - y2)*(y - y2);

	return d1 < d2 ? { x: x1, y: y1 } : { x: x2, y: y2 };
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

export const SkeletalView: React.FC<{initialData?: string, onChange?: (data: string) => void, readOnly?: boolean, mode: DrawingMode, setMode: (m: DrawingMode) => void}> = ({initialData, onChange, readOnly, mode, setMode}) => {
	const [elements, setElements] = useState<ElementNode[]>([]);
	const [bonds, setBonds] = useState<Bond[]>([]);
	const [annotations, setAnnotations] = useState<Annotation[]>([]);
	const [history, setHistory] = useState<HistoryState[]>([]);
	
	const [activeTool, setActiveTool] = useState<Tool>('select');
	const [newElementText, setNewElementText] = useState('C');
	const [groupAlign, setGroupAlign] = useState<'start' | 'middle' | 'end'>('start');
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [currentColor, setCurrentColor] = useState<string>('');
	
	const [scale, setScale] = useState(1);
	const [pan, setPan] = useState({x: 0, y: 0});
	
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	
	const [dragNodeId, setDragNodeId] = useState<string | null>(null);
	const [dragItemType, setDragItemType] = useState<'annotation' | 'control' | 'arrow_start' | 'arrow_end' | 'pan' | 'resize' | 'multi_drag' | null>(null);
	const [dragStartPos, setDragStartPos] = useState({x: 0, y: 0});
	const [dragInitialState, setDragInitialState] = useState<{elements: ElementNode[], annotations: Annotation[]} | null>(null);
	const [selectionBox, setSelectionBox] = useState<{start: {x:number, y:number}, current: {x:number, y:number}} | null>(null);
	
	const [drawingBondFrom, setDrawingBondFrom] = useState<string | null>(null);
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
				
				if (readOnly && d.elements && d.elements.length > 0) {
					const xs = d.elements.map((e: any) => e.x);
					const ys = d.elements.map((e: any) => e.y);
					const minX = Math.min(...xs);
					const maxX = Math.max(...xs);
					const minY = Math.min(...ys);
					const maxY = Math.max(...ys);
					setPan({x: -(minX + maxX)/2 + 150, y: -(minY + maxY)/2 + 150});
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
			}
		}
	}, [history, readOnly]);

	const handleDelete = useCallback(() => {
		if (readOnly) return;
		if (selectedIds.length === 0) return;
		pushHistory();

		setElements(elements.filter(e => !selectedIds.includes(e.id)));
		setBonds(bonds.filter(b => !selectedIds.includes(b.from) && !selectedIds.includes(b.to) && !selectedIds.includes(b.id)));
		setAnnotations(annotations.filter(a => !selectedIds.includes(a.id)));
		setSelectedIds([]);
	}, [selectedIds, elements, bonds, annotations, pushHistory, readOnly]);

	// Listeners for Delete key
	useEffect(() => {
		if (readOnly) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLSelectElement) return;
			// Allow backspace and delete when inside our particular input fields so it doesn't nuke selected elements accidentally while typing!
			if (e.target instanceof HTMLInputElement) {
				if (e.key === 'Delete' || e.key === 'Backspace') return;
			}
			
			if (e.key === 'Delete' || e.key === 'Backspace') {
				handleDelete();
			}
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

	// Update selected items color when currentColor changes
	const handleColorChange = (newColor: string) => {
		setCurrentColor(newColor);
		if (selectedIds.length > 0) {
			pushHistory();
			setElements(elements.map(e => selectedIds.includes(e.id) ? { ...e, color: newColor } : e));
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
		const preventZoom = (e: WheelEvent) => {
			if (e.ctrlKey || e.metaKey) e.preventDefault();
		};
		if (el) el.addEventListener('wheel', preventZoom, { passive: false });
		return () => { if (el) el.removeEventListener('wheel', preventZoom); };
	}, []);

	const handleSvgClick = (e: ReactMouseEvent) => {
		if (readOnly) return;
		if (dragNodeId || selectionBox) return;
		if (activeTool === 'pan' || e.button === 1) return;

		const coords = getMouseCoords(e);
		const gridPoint = snapToIsoGrid(coords.x, coords.y);
		const gridX = gridPoint.x;
		const gridY = gridPoint.y;

		if (activeTool === 'select') {
			setSelectedIds([]);
		} else if (activeTool === 'vertex') {
			pushHistory();
			setElements([...elements, { id: generateId(), text: '', x: gridX, y: gridY, color: currentColor, align: 'middle' }]);
		} else if (activeTool === 'heteroatom') {
			pushHistory();
			setElements([...elements, { id: generateId(), text: newElementText, x: gridX, y: gridY, color: currentColor, align: groupAlign }]);
		} else if (activeTool === 'text') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'text', x: gridX, y: gridY, value: newElementText, color: currentColor }]);
		} else if (activeTool === 'benzene') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'benzene', x: gridX, y: gridY, color: currentColor, scale: 1 }]);
		} else if (activeTool === 'bracket_left') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'bracket_left', x: gridX, y: gridY, color: currentColor, scale: 1 }]);
		} else if (activeTool === 'bracket_right') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'bracket_right', x: gridX, y: gridY, color: currentColor, scale: 1 }]);
		} else if (activeTool === 'charge_plus' || activeTool === 'charge_minus') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'charge', x: coords.x, y: coords.y, value: activeTool === 'charge_plus' ? '+' : '-', color: currentColor }]);
		} else if (activeTool === 'delta_plus' || activeTool === 'delta_minus') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'delta_charge', x: coords.x, y: coords.y, value: activeTool === 'delta_plus' ? 'δ+' : 'δ-', color: currentColor }]);
		} else if (activeTool === 'electron_pair_v') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'electron_pair', x: coords.x, y: coords.y, vertical: true, color: currentColor }]);
		} else if (activeTool === 'electron_pair_h') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'electron_pair', x: coords.x, y: coords.y, vertical: false, color: currentColor }]);
		} else if (activeTool === 'reaction_plus') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'reaction_plus', x: coords.x, y: coords.y, value: '+', color: currentColor }]);
		} else if (activeTool === 'reaction_arrow') {
			pushHistory();
			setAnnotations([...annotations, { id: generateId(), type: 'reaction_arrow', x: coords.x, y: coords.y, value: '→', color: currentColor }]);
		} else if (activeTool.startsWith('bond_')) {
			pushHistory();
			const newId = generateId();
			const type = activeTool.replace('bond_', '') as BondType;
			const newEl = { id: newId, text: '', x: gridX, y: gridY, color: currentColor, align: 'middle' as const };
			
			if (drawingBondFrom) {
				setBonds([...bonds, { id: generateId(), from: drawingBondFrom, to: newId, type }]);
			}
			setElements([...elements, newEl]);
			setDrawingBondFrom(newId);
		}
	};

	const handlePointerDownElement = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (e.button === 1 || activeTool === 'pan') {
			setDragItemType('pan'); return;
		}
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
			setDragInitialState({ elements, annotations });
		} else if (activeTool.startsWith('bond_')) {
			// If clicking an existing element with a bond tool, select it as the start point
			setDrawingBondFrom(id);
		}
	};

	const handlePointerUpElement = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (drawingBondFrom && drawingBondFrom !== id) {
			pushHistory();
			const type = activeTool.replace('bond_', '') as BondType;
			setBonds([...bonds, { id: generateId(), from: drawingBondFrom, to: id, type }]);
			// Chain the drawing
			setDrawingBondFrom(id);
		}
		setDragNodeId(null);
		setDragItemType(null);
	};

	const handlePointerDownAnnotation = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (e.button === 1 || activeTool === 'pan') {
			setDragItemType('pan'); return;
		}
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
			setDragInitialState({ elements, annotations });
		}
	};

	const handlePointerDownBond = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (activeTool === 'select') {
			if (!e.shiftKey) setSelectedIds([id]);
			else if (!selectedIds.includes(id)) setSelectedIds([...selectedIds, id]);
		}
	};

	const handlePointerDownCanvas = (e: ReactMouseEvent) => {
		if (activeTool === 'pan' || e.button === 1) {
			setDragItemType('pan'); return;
		}
		if (readOnly) return;
		
		const coords = getMouseCoords(e);
		if (activeTool === 'curly_arrow') {
			setDrawingArrow({ start: coords, current: coords });
		} else if (activeTool === 'select') {
			if (!e.shiftKey) setSelectedIds([]);
			setSelectionBox({ start: coords, current: coords });
		} else {
			handleSvgClick(e);
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
		if (dragItemType === 'pan') {
			setPan({ x: pan.x + e.movementX, y: pan.y + e.movementY });
			return;
		}

		if (readOnly) return;
		const coords = getMouseCoords(e);
		const gridPoint = snapToIsoGrid(coords.x, coords.y);
		setMousePos({ x: gridPoint.x, y: gridPoint.y });

		if (selectionBox) {
			setSelectionBox({ ...selectionBox, current: coords });
		}

		if (dragNodeId && activeTool === 'select') {
			if (dragItemType === 'multi_drag' && dragInitialState) {
				const dx = snapToIsoGrid(coords.x, coords.y).x - snapToIsoGrid(dragStartPos.x, dragStartPos.y).x;
				const dy = snapToIsoGrid(coords.x, coords.y).y - snapToIsoGrid(dragStartPos.x, dragStartPos.y).y;
				
				setElements(dragInitialState.elements.map(el => 
					selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el
				));
				setAnnotations(dragInitialState.annotations.map(a => 
					selectedIds.includes(a.id) && !a.points ? { ...a, x: a.x + dx, y: a.y + dy } : a
				));
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

		if (drawingArrow) {
			setDrawingArrow({ ...drawingArrow, current: coords });
		}
	};

	const handlePointerUp = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') {
			setDragItemType(null); return;
		}
		if (readOnly) return;
		if (dragNodeId) pushHistory();
		if (drawingBondFrom) setDrawingBondFrom(null);
		
		if (selectionBox) {
			const minX = Math.min(selectionBox.start.x, selectionBox.current.x);
			const maxX = Math.max(selectionBox.start.x, selectionBox.current.x);
			const minY = Math.min(selectionBox.start.y, selectionBox.current.y);
			const maxY = Math.max(selectionBox.start.y, selectionBox.current.y);
			
			const newSelected: string[] = [];
			elements.forEach(e => {
				if (e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY) newSelected.push(e.id);
			});
			annotations.forEach(a => {
				if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) newSelected.push(a.id);
			});
			const newlyEmerged = Array.from(new Set([...selectedIds, ...newSelected]));
			setSelectedIds(newlyEmerged);
			setSelectionBox(null);
			if (newlyEmerged.length === 1) {
				const id = newlyEmerged[0];
				const el = elements.find(e => e.id === id);
				if (el) setNewElementText(el.text);
				const ann = annotations.find(a => a.id === id);
				if (ann && (ann.type === 'text' || ann.type === 'charge' || ann.type === 'delta_charge' || ann.type.startsWith('reaction_'))) {
					setNewElementText(ann.value || '');
				}
			}
		}

		if (dragNodeId) {
			setDragNodeId(null);
			setDragItemType(null);
			setDragInitialState(null);
		}
		if (drawingArrow) {
			pushHistory();
			const type = activeTool as AnnotationType;
			setAnnotations([...annotations, { 
				id: generateId(), 
				type,
				x: drawingArrow.start.x, 
				y: drawingArrow.start.y,
				points: [drawingArrow.start, drawingArrow.current],
				control: getInitialControlPoint(drawingArrow.start, drawingArrow.current),
				color: currentColor
			}]);
			setDrawingArrow(null);
			setActiveTool('select');
		}
	};

	const renderBond = (bond: Bond) => {
		const fromEl = elements.find(e => e.id === bond.from);
		const toEl = elements.find(e => e.id === bond.to);
		if (!fromEl || !toEl) return null;

		const dx = toEl.x - fromEl.x;
		const dy = toEl.y - fromEl.y;
		const dist = Math.sqrt(dx*dx + dy*dy);
		const radius1 = (fromEl.text && fromEl.text !== '') ? 12 * (fromEl.scale || 1) : 0;
		const radius2 = (toEl.text && toEl.text !== '') ? 12 * (toEl.scale || 1) : 0;

		let startX = fromEl.x; let startY = fromEl.y;
		let endX = toEl.x; let endY = toEl.y;

		if (dist > radius1 + radius2) {
			startX = fromEl.x + (dx/dist) * radius1;
			startY = fromEl.y + (dy/dist) * radius1;
			endX = toEl.x - (dx/dist) * radius2;
			endY = toEl.y - (dy/dist) * radius2;
		}

		const ndx = endX - startX;
		const ndy = endY - startY;
		const angle = Math.atan2(ndy, ndx);
		const offsetX = Math.sin(angle) * 4;
		const offsetY = Math.cos(angle) * 4;

		let paths = [];
		const isSelected = selectedIds.includes(bond.id);
		const strokeColor = isSelected && !readOnly ? "var(--color-red, #f02020)" : "var(--text-normal)";

		if (bond.type === 'single' || bond.type === 'dotted') {
			paths.push(<line key="mid" x1={startX} y1={startY} x2={endX} y2={endY} stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"} strokeDasharray={bond.type === 'dotted' ? "4 4" : "none"} />);
		} else if (bond.type === 'double') {
			paths.push(<line key="offset1" x1={startX - offsetX} y1={startY + offsetY} x2={endX - offsetX} y2={endY + offsetY} stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"} />);
			paths.push(<line key="offset2" x1={startX + offsetX} y1={startY - offsetY} x2={endX + offsetX} y2={endY - offsetY} stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"} />);
		} else if (bond.type === 'triple') {
			paths.push(<line key="mid" x1={startX} y1={startY} x2={endX} y2={endY} stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"} />);
			paths.push(<line key="offset1" x1={startX - offsetX*2} y1={startY + offsetY*2} x2={endX - offsetX*2} y2={endY + offsetY*2} stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"} />);
			paths.push(<line key="offset2" x1={startX + offsetX*2} y1={startY - offsetY*2} x2={endX + offsetX*2} y2={endY - offsetY*2} stroke={strokeColor} strokeWidth={isSelected ? "3" : "2"} />);
		}

		return (
			<g key={bond.id} onPointerDown={(e) => handlePointerDownBond(e, bond.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : 'default' }}>
				{!readOnly && <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="transparent" strokeWidth="15" />}
				{paths}
			</g>
		);
	};

	let viewBoxFull = undefined;
	if (readOnly) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const tryInclude = (x: number, y: number) => {
			if (isNaN(x) || isNaN(y)) return;
			if (x < minX) minX = x; if (x > maxX) maxX = x;
			if (y < minY) minY = y; if (y > maxY) maxY = y;
		};

		elements.forEach(e => { tryInclude(e.x - 20, e.y - 20); tryInclude(e.x + 20, e.y + 20); });
		annotations.forEach(a => {
			if (a.points) {
				a.points.forEach(p => tryInclude(p.x, p.y));
			} else {
				tryInclude(a.x - 15, a.y - 15); tryInclude(a.x + 15, a.y + 15);
			}
			if (a.control) {
				tryInclude(a.control.x, a.control.y);
			}
		});
		
		if (minX !== Infinity) {
			const pad = 10;
			viewBoxFull = `${minX - pad} ${minY - pad} ${maxX - minX + pad*2} ${maxY - minY + pad*2}`;
		}
	}

	return (
		<div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: readOnly ? 'auto' : undefined }}>
			{!readOnly && (
				<SkeletalToolbar 
					mode={mode} setMode={setMode}
					activeTool={activeTool} setActiveTool={setActiveTool}
					handleUndo={handleUndo} canUndo={history.length > 0}
					selectedIds={selectedIds} handleDelete={handleDelete}
					newElementText={newElementText} setNewElementText={setNewElementText}
					handleTextChange={handleTextChange} showEditInput={selectedIds.length === 1}
					groupAlign={groupAlign} setGroupAlign={setGroupAlign}
					currentColor={currentColor} setCurrentColor={handleColorChange}
				/>
			)}

			<div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: readOnly ? 'transparent' : 'var(--background-primary)' }}>
				<svg 
					ref={svgRef} 
					width={readOnly && viewBoxFull ? "100%" : "100%"}
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
						<pattern id="isoGrid" width="51.9615" height="30" patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
							<circle cx="0" cy="0" r="1.5" fill="var(--background-modifier-border)" />
							<circle cx="25.9808" cy="15" r="1.5" fill="var(--background-modifier-border)" />
						</pattern>
						<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
							<polygon points="0 0, 10 3.5, 0 7" fill="var(--text-normal)" />
						</marker>
						<marker id="arrowhead-color" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
							<polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" />
						</marker>
						{/* Reversible arrows */}
						<marker id="rev-top" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
							<polygon points="0 3.5, 10 3.5, 0 0" fill="context-stroke" />
						</marker>
						<marker id="rev-bot" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
							<polygon points="0 3.5, 10 3.5, 0 7" fill="context-stroke" />
						</marker>
						{/* Curly arrows */}
						<marker id="curlyhead" markerWidth="6" markerHeight="4.5" refX="5" refY="2.25" orient="auto">
							<polygon points="0 0, 6 2.25, 0 4.5" fill="var(--text-normal)" />
						</marker>
						<marker id="curlyhead-color" markerWidth="6" markerHeight="4.5" refX="5" refY="2.25" orient="auto" markerUnits="strokeWidth">
							<polygon points="0 0, 6 2.25, 0 4.5" fill="context-stroke" />
						</marker>
					</defs>
					
					{/* Render seamless grid */}
					{!readOnly && <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#isoGrid)" onPointerDown={handlePointerDownCanvas} style={{ cursor: activeTool === 'pan' ? 'grab' : 'crosshair' }} />}

					<g transform={`translate(${readOnly ? 0 : pan.x}, ${readOnly ? 0 : pan.y}) scale(${readOnly ? 1 : scale})`}>
						
						{/* Selection Box overlay */}
						{selectionBox && (
							<rect 
								x={Math.min(selectionBox.start.x, selectionBox.current.x)}
								y={Math.min(selectionBox.start.y, selectionBox.current.y)}
								width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
								height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
								fill="var(--color-blue, #2080f0)" fillOpacity="0.1" stroke="var(--color-blue, #2080f0)" strokeWidth="1" strokeDasharray="4"
							/>
						)}

						{/* Draw active bond line */}
						{drawingBondFrom && (() => {
							const fromEl = elements.find(e => e.id === drawingBondFrom);
							if (fromEl) {
								return <line x1={fromEl.x} y1={fromEl.y} x2={mousePos.x} y2={mousePos.y} stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="4" />;
							}
							return null;
						})()}

						{/* Draw active drawing arrow */}
						{drawingArrow && activeTool === 'curly_arrow' && (() => {
							const c = getInitialControlPoint(drawingArrow.start, drawingArrow.current);
							return <path 
								d={`M ${drawingArrow.start.x} ${drawingArrow.start.y} Q ${c.x} ${c.y} ${drawingArrow.current.x} ${drawingArrow.current.y}`} 
								fill="none" stroke={currentColor} strokeWidth="2" strokeDasharray="4"
								markerEnd="url(#curlyhead)" 
							/>;
						})()}

						{/* Bonds */}
						{bonds.map(renderBond)}

						{/* Elements */}
						{elements.map(el => {
							const isSelected = selectedIds.includes(el.id) && !readOnly;
							const isEmptyNode = !el.text || el.text === '';
							return (
								<g key={el.id} transform={`translate(${el.x}, ${el.y}) scale(${el.scale || 1})`} onPointerDown={(e) => handlePointerDownElement(e, el.id)} onPointerUp={(e) => handlePointerUpElement(e, el.id)} style={{ cursor: 'pointer' }}>
									{!isEmptyNode && <text textAnchor={el.align || "middle"} dx={el.align === 'start' ? -6 : el.align === 'end' ? 6 : 0} dominantBaseline="central" fill={el.color || "var(--text-normal)"} fontWeight="bold" fontSize="16px" style={{ userSelect: 'none' }}>{el.text}</text>}
									<circle cx="0" cy="0" r="15" fill="transparent" />
									{isSelected && activeTool === 'select' && (
										<rect x={isEmptyNode ? 4 : (el.align === 'end' ? -14 : (el.align === 'start' ? 14 : 8))} y={isEmptyNode ? 4 : 8} width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(el.id); }} />
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
										<path d="M 0 -30 L -10 -30 L -10 30 L 0 30" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
										{isSelected && activeTool === 'select' && (
											<rect x="-5" y="25" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'bracket_right') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && <rect x="-10" y="-35" width="25" height="70" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<path d="M 0 -30 L 10 -30 L 10 30 L 0 30" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
										{isSelected && activeTool === 'select' && (
											<rect x="5" y="25" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'charge' || ann.type === 'delta_charge' || ann.type.startsWith('reaction_')) {
								const isReact = ann.type.startsWith('reaction_');
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && !isReact && <circle r="12" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										{isSelected && isReact && <rect x="-14" y="-14" width="28" height="28" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<text textAnchor="middle" dominantBaseline="central" fill={ann.color || "var(--text-normal)"} fontSize={isReact ? "24px" : "14px"} fontWeight="bold" style={{ userSelect: 'none' }}>{ann.value}</text>
										{isSelected && activeTool === 'select' && (
											<rect x={isReact ? 14 : 8} y={isReact ? 14 : 8} width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'electron_pair') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										<rect x="-8" y="-8" width="16" height="16" fill={isSelected ? strokeColor : "transparent"} opacity="0.3" rx="4" />
										{ann.vertical ? (
											<>
												<circle cx="0" cy="-3.5" r="2.5" fill={ann.color || "var(--text-normal)"} />
												<circle cx="0" cy="3.5" r="2.5" fill={ann.color || "var(--text-normal)"} />
											</>
										) : (
											<>
												<circle cx="-3.5" cy="0" r="2.5" fill={ann.color || "var(--text-normal)"} />
												<circle cx="3.5" cy="0" r="2.5" fill={ann.color || "var(--text-normal)"} />
											</>
										)}
										{isSelected && activeTool === 'select' && (
											<rect x="8" y="8" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							} else if (ann.type === 'text') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={(e) => handlePointerDownAnnotation(e, ann.id)} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && <rect x="-10" y="-10" width="20" height="20" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<text textAnchor="middle" dominantBaseline="central" fill={ann.color || "var(--text-normal)"} fontWeight="bold" fontSize="16px" style={{ userSelect: 'none' }}>{ann.value}</text>
										{isSelected && activeTool === 'select' && (
											<rect x="8" y="8" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={(e) => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
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
												<circle 
													cx={c.x} cy={c.y} r="6" fill="var(--color-blue, #2080f0)" cursor="move"
													onPointerDown={(e) => handlePointerDownControl(e, ann.id)}
												/>
												<circle 
													cx={pts[0].x} cy={pts[0].y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_start'); }}
												/>
												<circle 
													cx={pts[1].x} cy={pts[1].y} r="5" fill="var(--color-green, #20f080)" cursor="move"
													onPointerDown={(e) => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_end'); }}
												/>
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
