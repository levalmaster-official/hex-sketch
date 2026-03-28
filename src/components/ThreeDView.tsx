import React, { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { ElementNode, Bond, BondType, Annotation, AnnotationType, Tool, HistoryState, DrawingMode } from './chemistryTypes';
import { ThreeDToolbar } from './ThreeDToolbar';

const generateId = () => Math.random().toString(36).substring(2, 9);

const getInitialControlPoint = (start: {x: number, y: number}, end: {x: number, y: number}) => {
	const dx = end.x - start.x; const dy = end.y - start.y;
	const len = Math.sqrt(dx*dx + dy*dy);
	if (len === 0) return { x: start.x, y: start.y };
	const nx = -dy/len; const ny = dx/len;
	const offset = Math.min(len/2, 40);
	return { x: start.x + dx/2 + nx * offset, y: start.y + dy/2 + ny * offset };
};

// Returns bounding radius for bond trimming. Smaller for aligned groups to allow bond to reach the 'anchor' letter.
const labelRadius = (el: ElementNode) => {
	if (!el.text || el.text === '') return 0;
	const s = el.scale || 1;
	if (el.align === 'start' || el.align === 'end') return 8 * s; // Just enough for the anchor letter
	return (el.text.length * 4.5 + 5) * s; // Proportional for centered labels
};

export const ThreeDView: React.FC<{
	initialData?: string;
	onChange?: (data: string) => void;
	readOnly?: boolean;
	mode: DrawingMode;
	setMode: (m: DrawingMode) => void;
	isBlank?: boolean;
}> = ({ initialData, onChange, readOnly, mode, setMode, isBlank }) => {

	const [elements, setElements] = useState<ElementNode[]>([]);
	const [bonds, setBonds] = useState<Bond[]>([]);
	const [annotations, setAnnotations] = useState<Annotation[]>([]);
	const [history, setHistory] = useState<HistoryState[]>([]);

	const [activeTool, setActiveTool] = useState<Tool>('element');
	const [newElementText, setNewElementText] = useState('C');
	const [groupAlign, setGroupAlign] = useState<'start' | 'middle' | 'end'>('middle');
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [currentColor, setCurrentColor] = useState<string>('');

	const [scale, setScale] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });

	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Drag state
	const [dragNodeId, setDragNodeId] = useState<string | null>(null);
	const [dragItemType, setDragItemType] = useState<'multi_drag' | 'control' | 'arrow_start' | 'arrow_end' | 'pan' | 'resize' | 'mirror_start' | 'mirror_end' | null>(null);
	const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
	const [dragInitialState, setDragInitialState] = useState<{ elements: ElementNode[], bonds: Bond[], annotations: Annotation[] } | null>(null);
	const [selectionBox, setSelectionBox] = useState<{ start: {x:number, y:number}, current: {x:number, y:number} } | null>(null);

	// Bond drawing state: drag from element to element/space
	const [bondFrom, setBondFrom] = useState<string | null>(null);
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

	// Mirror line drawing
	const [drawingMirror, setDrawingMirror] = useState<{ start: {x:number,y:number}, current: {x:number,y:number} } | null>(null);

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
			} catch {}
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
		if (readOnly || history.length === 0) return;
		const last = history[history.length - 1];
		if (last) {
			setElements(last.elements); setBonds(last.bonds); setAnnotations(last.annotations);
			setHistory(prev => prev.slice(0, -1));
			setSelectedIds([]);
		}
	}, [history, readOnly]);

	const handleDelete = useCallback(() => {
		if (readOnly || selectedIds.length === 0) return;
		pushHistory();
		setElements(elements.filter(e => !selectedIds.includes(e.id)));
		setBonds(bonds.filter(b => !selectedIds.includes(b.id) && !selectedIds.includes(b.from) && !selectedIds.includes(b.to)));
		setAnnotations(annotations.filter(a => !selectedIds.includes(a.id)));
		setSelectedIds([]);
	}, [selectedIds, elements, bonds, annotations, pushHistory, readOnly]);

	useEffect(() => {
		if (readOnly) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
			if (e.key === 'Delete' || e.key === 'Backspace') handleDelete();
			if (e.key === 'Escape') { setBondFrom(null); setDrawingMirror(null); }
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [handleDelete, readOnly]);

	const handleTextChange = (newText: string) => {
		setNewElementText(newText);
		if (selectedIds.length === 1) {
			const id = selectedIds[0];
			const el = elements.find(e => e.id === id);
			if (el) { pushHistory(); setElements(elements.map(e => e.id === id ? { ...e, text: newText } : e)); return; }
			const ann = annotations.find(a => a.id === id);
			if (ann && (ann.type === 'text' || ann.type === 'charge' || ann.type === 'delta_charge')) {
				pushHistory(); setAnnotations(annotations.map(a => a.id === id ? { ...a, value: newText } : a));
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

	const getMouseCoords = (e: ReactMouseEvent | MouseEvent) => {
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
				setScale(newScale);
				setPan({ x: rawX - (rawX - pan.x) * (newScale / scale), y: rawY - (rawY - pan.y) * (newScale / scale) });
			}
		} else {
			setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
		}
	};

	useEffect(() => {
		const el = containerRef.current;
		const prevent = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
		if (el) el.addEventListener('wheel', prevent, { passive: false });
		return () => { if (el) el.removeEventListener('wheel', prevent); };
	}, []);

	// Find element near a point
	const findElementAt = (x: number, y: number, threshold = 22): ElementNode | null => {
		for (const el of elements) {
			const dx = x - el.x; const dy = y - el.y;
			if (Math.sqrt(dx*dx + dy*dy) < threshold) return el;
		}
		return null;
	};

	const isBondTool = (t: Tool) => ['bond_single','bond_double','bond_triple','bond_wedge','bond_dash','bond_dotted'].includes(t);

	const handlePointerDownCanvas = (e: ReactMouseEvent) => {
		if (e.button === 1 || activeTool === 'pan') { setDragItemType('pan'); return; }
		if (readOnly) return;

		const coords = getMouseCoords(e);

		if (activeTool === 'select') {
			if (!e.shiftKey) setSelectedIds([]);
			setSelectionBox({ start: coords, current: coords });
			setBondFrom(null); return;
		}

		// Mirror line
		if (activeTool === 'mirror_line') {
			setDrawingMirror({ start: coords, current: coords });
			return;
		}

		// Bond drawing: click on empty space while mid-draw creates a new element
		if (isBondTool(activeTool) && bondFrom) {
			const nearEl = findElementAt(coords.x, coords.y);
			if (!nearEl) {
				// Create new element at clicked coords and complete the bond
				pushHistory();
				const newEl: ElementNode = {
					id: generateId(), text: newElementText, x: coords.x, y: coords.y,
					color: currentColor || undefined, align: groupAlign
				};
				const bondType = activeTool.replace('bond_', '') as BondType;
				const newBond: Bond = { id: generateId(), from: bondFrom, to: newEl.id, type: bondType, color: currentColor || undefined };
				setElements(prev => [...prev, newEl]);
				setBonds(prev => [...prev, newBond]);
				setBondFrom(newEl.id); // chain from the new element
			}
			return;
		}

		// Place element/group/text
		if (activeTool === 'element' || activeTool === 'group') {
			pushHistory();
			setElements(prev => [...prev, {
				id: generateId(), text: newElementText, x: coords.x, y: coords.y,
				color: currentColor || undefined, align: groupAlign
			}]);
			return;
		}
		if (activeTool === 'text') {
			pushHistory();
			setAnnotations(prev => [...prev, {
				id: generateId(), type: 'text', x: coords.x, y: coords.y,
				value: newElementText, color: currentColor || undefined
			}]);
			return;
		}

		// Charges
		if (activeTool === 'charge_plus' || activeTool === 'charge_minus') {
			pushHistory();
			setAnnotations(prev => [...prev, {
				id: generateId(), type: 'charge', x: coords.x, y: coords.y,
				value: activeTool === 'charge_plus' ? '+' : '−', color: currentColor || undefined
			}]);
			return;
		}
		if (activeTool === 'delta_plus' || activeTool === 'delta_minus') {
			pushHistory();
			setAnnotations(prev => [...prev, {
				id: generateId(), type: 'delta_charge', x: coords.x, y: coords.y,
				value: activeTool === 'delta_plus' ? 'δ+' : 'δ−', color: currentColor || undefined
			}]);
			return;
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
				setSelectedIds(prev => [...prev, id]);
			}
			setDragNodeId(id); setDragItemType('multi_drag');
			setDragStartPos(getMouseCoords(e));
			setDragInitialState({ elements, bonds, annotations });
			return;
		}

		if (isBondTool(activeTool)) {
			if (!bondFrom) {
				setBondFrom(id);
			} else {
				// Complete the bond
				if (bondFrom !== id) {
					pushHistory();
					const bondType = activeTool.replace('bond_', '') as BondType;
					setBonds(prev => [...prev, { id: generateId(), from: bondFrom, to: id, type: bondType, color: currentColor || undefined }]);
				}
				setBondFrom(id); // continue chaining from this element
			}
		}
	};

	const handlePointerDownAnnotation = (e: ReactMouseEvent, id: string) => {
		if (readOnly) return;
		e.stopPropagation();
		if (activeTool === 'select') {
			if (!e.shiftKey && !selectedIds.includes(id)) {
				setSelectedIds([id]);
				const ann = annotations.find(a => a.id === id);
				if (ann && (ann.type === 'text' || ann.type === 'charge' || ann.type === 'delta_charge')) {
					setNewElementText(ann.value || '');
				}
			} else if (e.shiftKey && !selectedIds.includes(id)) {
				setSelectedIds(prev => [...prev, id]);
			}
			setDragNodeId(id); setDragItemType('multi_drag');
			setDragStartPos(getMouseCoords(e));
			setDragInitialState({ elements, bonds, annotations });
		}
	};

	const handlePointerMove = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') { setPan({ x: pan.x + e.movementX, y: pan.y + e.movementY }); return; }
		if (readOnly) return;
		const coords = getMouseCoords(e);
		setMousePos(coords);

		if (selectionBox) { setSelectionBox({ ...selectionBox, current: coords }); }

		if (drawingMirror) { setDrawingMirror({ ...drawingMirror, current: coords }); }

		if (dragNodeId && dragItemType === 'multi_drag' && dragInitialState) {
			const dx = coords.x - dragStartPos.x;
			const dy = coords.y - dragStartPos.y;
			setElements(dragInitialState.elements.map(el => selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
			setAnnotations(dragInitialState.annotations.map(a => {
				if (!selectedIds.includes(a.id)) return a;
				if (a.points) return { ...a, points: a.points.map(p => ({ x: p.x + dx, y: p.y + dy })), control: a.control ? { x: a.control.x + dx, y: a.control.y + dy } : undefined };
				return { ...a, x: a.x + dx, y: a.y + dy };
			}));
		}
		if (dragNodeId && dragItemType === 'control') {
			setAnnotations(annotations.map(a => a.id === dragNodeId ? { ...a, control: { x: coords.x, y: coords.y } } : a));
		}
		if (dragNodeId && dragItemType === 'mirror_start') {
			setAnnotations(annotations.map(a => a.id === dragNodeId && a.points ? { ...a, points: [{ x: coords.x, y: coords.y }, a.points[1]!] } : a));
		}
		if (dragNodeId && dragItemType === 'mirror_end') {
			setAnnotations(annotations.map(a => a.id === dragNodeId && a.points ? { ...a, points: [a.points[0]!, { x: coords.x, y: coords.y }] } : a));
		}
	};

	const handlePointerUp = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') { setDragItemType(null); return; }
		if (readOnly) return;

		if (dragNodeId) { pushHistory(); setDragNodeId(null); setDragItemType(null); setDragInitialState(null); }

		if (selectionBox) {
			const minX = Math.min(selectionBox.start.x, selectionBox.current.x);
			const maxX = Math.max(selectionBox.start.x, selectionBox.current.x);
			const minY = Math.min(selectionBox.start.y, selectionBox.current.y);
			const maxY = Math.max(selectionBox.start.y, selectionBox.current.y);
			const newSel: string[] = [];
			elements.forEach(el => { if (el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY) newSel.push(el.id); });
			annotations.forEach(a => { if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) newSel.push(a.id); });
			setSelectedIds(prev => Array.from(new Set([...prev, ...newSel])));
			setSelectionBox(null);
		}

		if (drawingMirror) {
			const dx = drawingMirror.current.x - drawingMirror.start.x;
			const dy = drawingMirror.current.y - drawingMirror.start.y;
			const dist = Math.sqrt(dx*dx + dy*dy);
			if (dist > 10) {
				pushHistory();
				setAnnotations(prev => [...prev, {
					id: generateId(), type: 'mirror_line',
					x: (drawingMirror.start.x + drawingMirror.current.x) / 2,
					y: (drawingMirror.start.y + drawingMirror.current.y) / 2,
					points: [drawingMirror.start, drawingMirror.current],
					color: currentColor || undefined
				}]);
			}
			setDrawingMirror(null);
			setActiveTool('select');
		}
	};

	// ─── Bond rendering ───────────────────────────────────────────────────────

	const renderBond = (bond: Bond): React.ReactElement | null => {
		const fromEl = elements.find(e => e.id === bond.from);
		const toEl = elements.find(e => e.id === bond.to);
		if (!fromEl || !toEl) return null;

		const dx = toEl.x - fromEl.x; const dy = toEl.y - fromEl.y;
		const len = Math.sqrt(dx*dx + dy*dy);
		if (len === 0) return null;
		const ux = dx/len; const uy = dy/len;
		const nx = -uy; const ny = ux; // perp

		const r1 = labelRadius(fromEl); const r2 = labelRadius(toEl);
		const startX = fromEl.x + ux * r1; const startY = fromEl.y + uy * r1;
		const endX = toEl.x - ux * r2; const endY = toEl.y - uy * r2;
		const segLen = Math.sqrt((endX-startX)**2 + (endY-startY)**2);

		const isSelected = selectedIds.includes(bond.id) && !readOnly;
		const strokeCol = isSelected ? 'var(--color-red, #f02020)' : (bond.color || 'var(--text-normal)');
		const sw = isSelected ? 3 : 2;

		let inner: React.ReactElement;
		const HALF_W = 7; // half-width of wedge wide end

		if (bond.type === 'single') {
			inner = <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={strokeCol} strokeWidth={sw} />;
		} else if (bond.type === 'dotted') {
			inner = <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={strokeCol} strokeWidth={sw} strokeDasharray="4 4" />;
		} else if (bond.type === 'double') {
			const off = 4;
			inner = <g>
				<line x1={startX - nx*off} y1={startY - ny*off} x2={endX - nx*off} y2={endY - ny*off} stroke={strokeCol} strokeWidth={sw} />
				<line x1={startX + nx*off} y1={startY + ny*off} x2={endX + nx*off} y2={endY + ny*off} stroke={strokeCol} strokeWidth={sw} />
			</g>;
		} else if (bond.type === 'triple') {
			const off = 5;
			inner = <g>
				<line x1={startX} y1={startY} x2={endX} y2={endY} stroke={strokeCol} strokeWidth={sw} />
				<line x1={startX - nx*off} y1={startY - ny*off} x2={endX - nx*off} y2={endY - ny*off} stroke={strokeCol} strokeWidth={sw} />
				<line x1={startX + nx*off} y1={startY + ny*off} x2={endX + nx*off} y2={endY + ny*off} stroke={strokeCol} strokeWidth={sw} />
			</g>;
		} else if (bond.type === 'wedge') {
			// Solid wedge: point at start (fromEl), wide at end (toEl)
			const pts = `${startX},${startY} ${endX + nx*HALF_W},${endY + ny*HALF_W} ${endX - nx*HALF_W},${endY - ny*HALF_W}`;
			inner = <polygon points={pts} fill={strokeCol} stroke={strokeCol} strokeWidth="1" strokeLinejoin="round" />;
		} else if (bond.type === 'dash') {
			// Dashed wedge: series of lines getting wider from start to end
			const N = Math.max(4, Math.round(segLen / 7));
			const lines = [];
			for (let i = 0; i <= N; i++) {
				const t = i / N;
				const cx = startX + t * (endX - startX);
				const cy = startY + t * (endY - startY);
				const hw = t * HALF_W;
				lines.push(
					<line key={i}
						x1={cx - nx*hw} y1={cy - ny*hw}
						x2={cx + nx*hw} y2={cy + ny*hw}
						stroke={strokeCol} strokeWidth={sw} strokeLinecap="round"
					/>
				);
			}
			inner = <g>{lines}</g>;
		} else {
			inner = <line x1={startX} y1={startY} x2={endX} y2={endY} stroke={strokeCol} strokeWidth={sw} />;
		}

		return (
			<g key={bond.id}
				onPointerDown={e => {
					if (readOnly || activeTool !== 'select') return;
					e.stopPropagation();
					if (!e.shiftKey) setSelectedIds([bond.id]);
					else if (!selectedIds.includes(bond.id)) setSelectedIds(prev => [...prev, bond.id]);
				}}
				style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : 'default' }}>
				<line x1={startX} y1={startY} x2={endX} y2={endY} stroke="transparent" strokeWidth="14" />
				{inner}
			</g>
		);
	};

	// ─── Preview bond while dragging ──────────────────────────────────────────
	const renderBondPreview = () => {
		if (!bondFrom || !isBondTool(activeTool)) return null;
		const fromEl = elements.find(e => e.id === bondFrom);
		if (!fromEl) return null;
		const dx = mousePos.x - fromEl.x; const dy = mousePos.y - fromEl.y;
		const len = Math.sqrt(dx*dx + dy*dy);
		if (len < 5) return null;
		return (
			<line
				x1={fromEl.x} y1={fromEl.y}
				x2={mousePos.x} y2={mousePos.y}
				stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="6 4"
			/>
		);
	};

	// ─── Compute viewBox for readOnly ─────────────────────────────────────────
	let viewBoxFull: string | undefined = undefined;
	if (readOnly) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const inc = (x: number, y: number) => {
			if (isNaN(x) || isNaN(y)) return;
			if (x < minX) minX = x; if (x > maxX) maxX = x;
			if (y < minY) minY = y; if (y > maxY) maxY = y;
		};
		elements.forEach(el => { inc(el.x - 20, el.y - 20); inc(el.x + 20, el.y + 20); });
		annotations.forEach(a => {
			if (a.points) a.points.forEach(p => inc(p.x, p.y));
			else { inc(a.x - 15, a.y - 15); inc(a.x + 15, a.y + 15); }
		});
		bonds.forEach(b => {
			const from = elements.find(e => e.id === b.from);
			const to = elements.find(e => e.id === b.to);
			if (from && to) { inc(from.x, from.y); inc(to.x, to.y); }
		});
		if (minX !== Infinity) {
			const pad = 15;
			viewBoxFull = `${minX - pad} ${minY - pad} ${maxX - minX + pad*2} ${maxY - minY + pad*2}`;
		}
	}

	return (
		<div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: readOnly ? 'auto' : undefined }}>
			{!readOnly && (
				<ThreeDToolbar
					mode={mode} setMode={setMode}
					activeTool={activeTool}
					setActiveTool={tool => { setActiveTool(tool); setBondFrom(null); setDrawingMirror(null); }}
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
					height={readOnly && viewBoxFull ? 'auto' : '100%'}
					viewBox={viewBoxFull}
					style={{ touchAction: 'none', maxHeight: readOnly ? '500px' : undefined }}
					onPointerDown={handlePointerDownCanvas}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerLeave={handlePointerUp}
					onWheel={handleWheel}
				>
					<defs>
						<marker id="3d-curlyhead" markerWidth="6" markerHeight="4.5" refX="5" refY="2.25" orient="auto">
							<polygon points="0 0, 6 2.25, 0 4.5" fill="var(--text-normal)" />
						</marker>
					</defs>

					{/* Cursor hint when bond tool is active but no start yet */}
					{!readOnly && isBondTool(activeTool) && !bondFrom && (
						<rect x="-10000" y="-10000" width="20000" height="20000" fill="transparent"
							style={{ cursor: 'crosshair' }} />
					)}

					<g transform={`translate(${readOnly ? 0 : pan.x}, ${readOnly ? 0 : pan.y}) scale(${readOnly ? 1 : scale})`}>

						{/* Selection box */}
						{selectionBox && (
							<rect
								x={Math.min(selectionBox.start.x, selectionBox.current.x)}
								y={Math.min(selectionBox.start.y, selectionBox.current.y)}
								width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
								height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
								fill="var(--color-blue, #2080f0)" fillOpacity="0.1"
								stroke="var(--color-blue, #2080f0)" strokeWidth="1" strokeDasharray="4"
							/>
						)}

						{/* Bond preview */}
						{renderBondPreview()}

						{/* Mirror line preview */}
						{drawingMirror && (
							<line
								x1={drawingMirror.start.x} y1={drawingMirror.start.y}
								x2={drawingMirror.current.x} y2={drawingMirror.current.y}
								stroke={currentColor || 'var(--text-muted)'} strokeWidth="2"
								strokeDasharray="8 5"
							/>
						)}

						{/* Bonds */}
						{bonds.map(renderBond)}

						{/* Elements */}
						{elements.map(el => {
							const isSelected = selectedIds.includes(el.id) && !readOnly;
							const isBondStart = bondFrom === el.id;
							return (
								<g key={el.id}
									transform={`translate(${el.x}, ${el.y}) scale(${el.scale || 1})`}
									onPointerDown={e => handlePointerDownElement(e, el.id)}
									style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : (isBondTool(activeTool) ? 'pointer' : 'default') }}>
									{/* White background to erase bond behind label */}
									<text
										textAnchor={el.align === 'start' ? 'start' : el.align === 'end' ? 'end' : 'middle'}
										dx={el.align === 'start' ? -6 : el.align === 'end' ? 6 : 0}
										dominantBaseline="central"
										fill="var(--background-primary)" stroke="var(--background-primary)" strokeWidth="6"
										fontWeight="bold" fontSize="15px" style={{ userSelect: 'none' }}
									>{el.text}</text>
									<text
										textAnchor={el.align === 'start' ? 'start' : el.align === 'end' ? 'end' : 'middle'}
										dx={el.align === 'start' ? -6 : el.align === 'end' ? 6 : 0}
										dominantBaseline="central"
										fill={el.color || 'var(--text-normal)'}
										fontWeight="bold" fontSize="15px" style={{ userSelect: 'none' }}
									>{el.text}</text>
									{/* Bond-start highlight */}
									{isBondStart && <circle r="16" fill="none" stroke="var(--color-blue, #2080f0)" strokeWidth="2" strokeDasharray="3 2" />}
									{/* Selection ring */}
									{isSelected && <circle r="16" fill="none" stroke="var(--color-red, #f02020)" strokeWidth="2" strokeDasharray="3 2" />}
									{/* Resize handle */}
									{isSelected && activeTool === 'select' && (
										<rect x="10" y="10" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize"
											onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(el.id); }}
										/>
									)}
								</g>
							);
						})}

						{/* Annotations */}
						{annotations.map(ann => {
							const isSelected = selectedIds.includes(ann.id) && !readOnly;
							const strokeColor = isSelected ? 'var(--color-red, #f02020)' : (ann.color || 'var(--text-normal)');

							if (ann.type === 'mirror_line' && ann.points && ann.points.length >= 2) {
								const [p0, p1] = ann.points;
								return (
									<g key={ann.id} onPointerDown={e => handlePointerDownAnnotation(e, ann.id)}>
										{/* Fat invisible hit area */}
										<line x1={p0!.x} y1={p0!.y} x2={p1!.x} y2={p1!.y} stroke="transparent" strokeWidth="12" style={{ cursor: 'pointer' }} />
										<line x1={p0!.x} y1={p0!.y} x2={p1!.x} y2={p1!.y}
											stroke={strokeColor} strokeWidth="1.5"
											strokeDasharray="10 6" />
										{isSelected && activeTool === 'select' && (
											<>
												<circle cx={p0!.x} cy={p0!.y} r="5" fill="var(--color-blue, #2080f0)" cursor="move"
													onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('mirror_start'); }}
												/>
												<circle cx={p1!.x} cy={p1!.y} r="5" fill="var(--color-blue, #2080f0)" cursor="move"
													onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('mirror_end'); }}
												/>
											</>
										)}
									</g>
								);
							}

							if (ann.type === 'text' || ann.type === 'charge' || ann.type === 'delta_charge') {
								const isBig = ann.type === 'charge' || ann.type === 'delta_charge';
								return (
									<g key={ann.id}
										transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`}
										onPointerDown={e => handlePointerDownAnnotation(e, ann.id)}
										style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}>
										{isSelected && <rect x="-14" y="-14" width="28" height="28" fill="transparent" stroke={strokeColor} strokeDasharray="2" />}
										<text textAnchor="middle" dominantBaseline="central"
											fill={ann.color || 'var(--text-normal)'}
											fontWeight="bold" fontSize={isBig ? '14px' : '15px'}
											style={{ userSelect: 'none' }}
										>{ann.value}</text>
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
