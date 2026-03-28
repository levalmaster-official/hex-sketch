import React, { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { ElementNode, Bond, BondType, Annotation, AnnotationType, Tool, DrawingMode } from './chemistryTypes';
import { useCanvas, generateId, snapToIsoGrid, getInitialControlPoint } from './common/useCanvas';
import { useNavigation } from './common/useNavigation';
import { UnifiedToolbar } from './common/UnifiedToolbar';
import { ChemText, CommonMarkers, BondRenderer } from './common/ChemPrimitives';

const findNearestBondEndpoint = (bonds: Bond[], x: number, y: number, threshold = 20): { x: number, y: number } | null => {
	let best: { x: number, y: number } | null = null;
	let bestDist = threshold;
	for (const b of bonds) {
		if (b.x1 === undefined) continue;
		for (const [ex, ey] of [[b.x1!, b.y1!], [b.x2!, b.y2!]] as [number, number][]) {
			const d = Math.sqrt((x - ex) ** 2 + (y - ey) ** 2);
			if (d < bestDist) { bestDist = d; best = { x: ex, y: ey }; }
		}
	}
	return best;
};

export const SkeletalView: React.FC<{ initialData?: string, onChange?: (data: string) => void, readOnly?: boolean, mode: DrawingMode, setMode: (m: DrawingMode) => void, isBlank?: boolean }> = ({ initialData, onChange, readOnly, mode, setMode, isBlank }) => {
	const { elements, setElements, bonds, setBonds, annotations, setAnnotations, history, pushHistory, undo, deleteSelection } = useCanvas({ initialData, onChange, readOnly, mode });
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const { scale, setScale, pan, setPan, getMouseCoords, handleWheel } = useNavigation(svgRef, containerRef, readOnly);

	const [activeTool, setActiveTool] = useState<Tool>('bond_single');
	const [newElementText, setNewElementText] = useState('O');
	const [groupAlign, setGroupAlign] = useState<'start' | 'middle' | 'end'>('middle');
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [currentColor, setCurrentColor] = useState<string>('');

	const [dragNodeId, setDragNodeId] = useState<string | null>(null);
	const [dragItemType, setDragItemType] = useState<'annotation' | 'control' | 'arrow_start' | 'arrow_end' | 'pan' | 'resize' | 'multi_drag' | null>(null);
	const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
	const [dragInitialState, setDragInitialState] = useState<{ elements: ElementNode[], annotations: Annotation[], bonds: Bond[] } | null>(null);
	const [selectionBox, setSelectionBox] = useState<{ start: { x: number, y: number }, current: { x: number, y: number } } | null>(null);

	const [chainEnd, setChainEnd] = useState<{ x: number, y: number } | null>(null);
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
	const [drawingArrow, setDrawingArrow] = useState<{ start: { x: number, y: number }, current: { x: number, y: number } } | null>(null);

	useEffect(() => {
		if (readOnly && bonds.length > 0) {
			const allX: number[] = []; const allY: number[] = [];
			bonds.forEach(b => { if (b.x1 !== undefined) { allX.push(b.x1, b.x2!); allY.push(b.y1!, b.y2!); } });
			elements?.forEach(e => { allX.push(e.x); allY.push(e.y); });
			if (allX.length > 0) {
				const minX = Math.min(...allX); const maxX = Math.max(...allX);
				const minY = Math.min(...allY); const maxY = Math.max(...allY);
				setPan({ x: -(minX + maxX) / 2 + 150, y: -(minY + maxY) / 2 + 150 });
			}
		}
	}, [readOnly, bonds.length, elements.length]);

	const handleUndo = useCallback(() => { undo(); setSelectedIds([]); setChainEnd(null); }, [undo]);
	const handleDelete = useCallback(() => { deleteSelection(selectedIds); setSelectedIds([]); }, [deleteSelection, selectedIds]);

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

	const handleTextChange = (text: string) => {
		setNewElementText(text);
		if (selectedIds.length === 1) {
			const id = selectedIds[0];
			const el = elements.find(e => e.id === id);
			if (el) { pushHistory(); setElements(elements.map(e => e.id === id ? { ...e, text: text } : e)); return; }
			const ann = annotations.find(a => a.id === id);
			if (ann && (ann.type === 'text' || ann.type === 'charge' || ann.type === 'delta_charge' || ann.type.startsWith('reaction_'))) {
				pushHistory(); setAnnotations(annotations.map(a => a.id === id ? { ...a, value: text } : a));
			}
		}
	};

	const handleColorChange = (color: string) => {
		setCurrentColor(color);
		if (selectedIds.length > 0) {
			pushHistory();
			setElements(elements.map(e => selectedIds.includes(e.id) ? { ...e, color } : e));
			setBonds(bonds.map(b => selectedIds.includes(b.id) ? { ...b, color } : b));
			setAnnotations(annotations.map(a => selectedIds.includes(a.id) ? { ...a, color } : a));
		}
	};

	const handlePointerDownCanvas = (e: ReactMouseEvent) => {
		if (activeTool === 'pan' || e.button === 1) { setDragItemType('pan'); return; }
		if (readOnly) return;
		const coords = getMouseCoords(e);
		if (activeTool === 'curly_arrow' || activeTool === 'reaction_arrow' || activeTool === 'reaction_reversible') {
			const pt = ['reaction_arrow', 'reaction_reversible'].includes(activeTool) ? snapToIsoGrid(coords.x, coords.y) : coords;
			setDrawingArrow({ start: pt, current: pt }); return;
		}
		if (activeTool === 'select') {
			if (!e.shiftKey) setSelectedIds([]);
			setSelectionBox({ start: coords, current: coords }); setChainEnd(null); return;
		}
		const snap = snapToIsoGrid(coords.x, coords.y);
		if (activeTool.startsWith('bond_')) {
			const type = activeTool.replace('bond_', '') as BondType;
			const startPt = findNearestBondEndpoint(bonds, snap.x, snap.y, 15) || snap;
			if (chainEnd) {
				pushHistory();
				setBonds([...bonds, { id: generateId(), from: '', to: '', type, x1: chainEnd.x, y1: chainEnd.y, x2: snap.x, y2: snap.y, color: currentColor || undefined }]);
				setChainEnd(snap);
			} else setChainEnd(startPt);
			return;
		}
		if (activeTool === 'heteroatom') {
			pushHistory(); setElements([...elements, { id: generateId(), text: newElementText, x: snap.x, y: snap.y, color: currentColor || undefined, align: groupAlign }]);
		} else if (activeTool === 'text') {
			pushHistory(); setAnnotations([...annotations, { id: generateId(), type: 'text', x: snap.x, y: snap.y, value: newElementText, color: currentColor || undefined }]);
		} else if (activeTool === 'benzene') {
			pushHistory(); setAnnotations([...annotations, { id: generateId(), type: 'benzene', x: snap.x, y: snap.y, color: currentColor || undefined, scale: 1 }]);
		} else if (activeTool === 'bracket_left' || activeTool === 'bracket_right') {
			pushHistory(); setAnnotations([...annotations, { id: generateId(), type: activeTool as AnnotationType, x: coords.x, y: coords.y, color: currentColor || undefined, scale: 1 }]);
		} else if (activeTool === 'charge_plus' || activeTool === 'charge_minus' || activeTool === 'delta_plus' || activeTool === 'delta_minus') {
			pushHistory(); const val = activeTool.includes('plus') ? (activeTool.startsWith('delta') ? 'δ⁺' : '+') : (activeTool.startsWith('delta') ? 'δ⁻' : '-');
			setAnnotations([...annotations, { id: generateId(), type: activeTool.startsWith('delta') ? 'delta_charge' : 'charge', x: coords.x, y: coords.y, value: val, color: currentColor || undefined }]);
		} else if (activeTool === 'electron_pair_v' || activeTool === 'electron_pair_h') {
			pushHistory(); setAnnotations([...annotations, { id: generateId(), type: 'electron_pair', x: coords.x, y: coords.y, vertical: activeTool === 'electron_pair_v', color: currentColor || undefined }]);
		}
	};

	const handlePointerDownBond = (e: ReactMouseEvent, id: string) => {
		if (readOnly || activeTool === 'heteroatom') return;
		e.stopPropagation(); setChainEnd(null);
		if (activeTool === 'select') {
			if (!e.shiftKey) setSelectedIds([id]);
			else if (!selectedIds.includes(id)) setSelectedIds([...selectedIds, id]);
		} else if (activeTool.startsWith('bond_')) {
			pushHistory(); setBonds(bonds.map(b => b.id === id ? { ...b, type: activeTool.replace('bond_', '') as BondType, color: currentColor || undefined } : b));
			if (activeTool === 'bond_single') {
				const b = bonds.find(b => b.id === id);
				if (b && b.x2 !== undefined) setChainEnd({ x: b.x2, y: b.y2! });
			}
		}
	};

	const handlePointerMove = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') { setPan({ x: pan.x + e.movementX, y: pan.y + e.movementY }); return; }
		if (readOnly) return;
		const coords = getMouseCoords(e); setMousePos(snapToIsoGrid(coords.x, coords.y));
		if (selectionBox) setSelectionBox({ ...selectionBox, current: coords });
		if (drawingArrow) {
			const pt = ['reaction_arrow', 'reaction_reversible'].includes(activeTool) ? snapToIsoGrid(coords.x, coords.y) : coords;
			setDrawingArrow({ ...drawingArrow, current: pt });
		}
		if (drawingArrow) {
			const target = ['reaction_arrow', 'reaction_reversible'].includes(activeTool) ? snapToIsoGrid(coords.x, coords.y) : coords;
			setDrawingArrow({ ...drawingArrow, current: target });
		}
		if (dragNodeId && activeTool === 'select') {
			if (dragItemType === 'multi_drag' && dragInitialState) {
				const dx = coords.x - dragStartPos.x; const dy = coords.y - dragStartPos.y;
				setElements(dragInitialState.elements.map(el => selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
				setBonds(dragInitialState.bonds.map(b => selectedIds.includes(b.id) && b.x1 !== undefined ? { ...b, x1: b.x1! + dx, y1: b.y1! + dy, x2: b.x2! + dx, y2: b.y2! + dy } : b));
				setAnnotations(dragInitialState.annotations.map(a => {
					if (!selectedIds.includes(a.id)) return a;
					if (a.points) return { ...a, points: a.points.map(p => ({ x: p.x + dx, y: p.y + dy })), control: a.control ? { x: a.control.x + dx, y: a.control.y + dy } : undefined };
					return { ...a, x: a.x + dx, y: a.y + dy };
				}));
			} else if (['control', 'arrow_start', 'arrow_end'].includes(dragItemType || '')) {
				setAnnotations(annotations.map(a => a.id === dragNodeId ? (dragItemType === 'control' ? { ...a, control: coords } : (dragItemType === 'arrow_start' ? { ...a, points: [coords, a.points![1]!] } : { ...a, points: [a.points![0]!, coords] })) : a));
			} else if (dragItemType === 'resize') {
				const el = elements.find(e => e.id === dragNodeId);
				if (el) { setElements(elements.map(e => e.id === dragNodeId ? { ...e, scale: Math.max(0.5, Math.sqrt((coords.x - el.x) ** 2 + (coords.y - el.y) ** 2) / 11) } : e)); }
				else {
					const ann = annotations.find(a => a.id === dragNodeId);
					if (ann) setAnnotations(annotations.map(a => a.id === dragNodeId ? { ...a, scale: Math.max(0.3, Math.sqrt((coords.x - (ann.points?.[0]?.x || ann.x)) ** 2 + (coords.y - (ann.points?.[0]?.y || ann.y)) ** 2) / (ann.points ? Math.sqrt((ann.points[1]!.x - ann.points[0]!.x) ** 2 + (ann.points[1]!.y - ann.points[0]!.y) ** 2) : 11)) } : a));
				}
			}
		}
	};

	const handlePointerUp = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') { setDragItemType(null); return; }
		if (readOnly) return;
		if (dragNodeId) pushHistory();
		if (selectionBox) {
			const minX = Math.min(selectionBox.start.x, selectionBox.current.x); const maxX = Math.max(selectionBox.start.x, selectionBox.current.x);
			const minY = Math.min(selectionBox.start.y, selectionBox.current.y); const maxY = Math.max(selectionBox.start.y, selectionBox.current.y);
			const newSel: string[] = [];
			elements.forEach(el => { if (el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY) newSel.push(el.id); });
			bonds.forEach(b => { if (b.x1 !== undefined && (b.x1 + b.x2!) / 2 >= minX && (b.x1 + b.x2!) / 2 <= maxX && (b.y1! + b.y2!) / 2 >= minY && (b.y1! + b.y2!) / 2 <= maxY) newSel.push(b.id); });
			annotations.forEach(a => { if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) newSel.push(a.id); });
			setSelectedIds(Array.from(new Set([...selectedIds, ...newSel]))); setSelectionBox(null);
		}
		if (drawingArrow) {
			pushHistory();
			const type = activeTool as AnnotationType;
			const start = drawingArrow.start;
			const current = (type === 'curly_arrow') ? drawingArrow.current : snapToIsoGrid(drawingArrow.current.x, drawingArrow.current.y);
			setAnnotations([...annotations, {
				id: generateId(), type, x: start.x, y: start.y,
				points: [start, current],
				control: getInitialControlPoint(start, current),
				color: currentColor || undefined
			}]);
			setDrawingArrow(null); setActiveTool('select');
		}
		if (drawingArrow) {
			pushHistory();
			const type = activeTool as AnnotationType;
			const start = drawingArrow.start;
			const current = ['reaction_arrow', 'reaction_reversible'].includes(type) ? snapToIsoGrid(drawingArrow.current.x, drawingArrow.current.y) : drawingArrow.current;
			setAnnotations([...annotations, { id: generateId(), type, x: start.x, y: start.y, points: [start, current], control: getInitialControlPoint(start, current), color: currentColor || undefined }]);
			setDrawingArrow(null); setActiveTool('select');
		}
		setDragNodeId(null);
		setDragItemType(null);
	};

	let viewBoxFull = undefined;
	if (readOnly) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const inc = (x: number, y: number) => { if (isNaN(x) || isNaN(y)) return; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
		bonds.forEach(b => { if (b.x1 !== undefined) { inc(b.x1, b.y1!); inc(b.x2!, b.y2!); } });
		elements.forEach(e => { inc(e.x - 20, e.y - 20); inc(e.x + 20, e.y + 20); });
		annotations.forEach(a => { if (a.points) a.points.forEach(p => inc(p.x, p.y)); else { inc(a.x - 15, a.y - 15); inc(a.x + 15, a.y + 15); } if (a.control) inc(a.control.x, a.control.y); });
		if (minX !== Infinity) { const pad = 15; viewBoxFull = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`; }
	}

	return (
		<div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: readOnly ? 'auto' : undefined }}>
			{!readOnly && <UnifiedToolbar mode={mode} setMode={setMode} activeTool={activeTool} setActiveTool={tool => { setActiveTool(tool); setChainEnd(null); }} handleUndo={handleUndo} canUndo={history.length > 0} selectedIds={selectedIds} handleDelete={handleDelete} newElementText={newElementText} handleTextChange={handleTextChange} showEditInput={selectedIds.length === 1} groupAlign={groupAlign} setGroupAlign={setGroupAlign} currentColor={currentColor} setCurrentColor={handleColorChange} isBlank={isBlank} />}
			<div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: readOnly ? 'transparent' : 'var(--background-primary)' }}>
				<svg ref={svgRef} width="100%" height={readOnly && viewBoxFull ? "auto" : "100%"} viewBox={viewBoxFull} style={{ touchAction: 'none', maxHeight: readOnly ? "500px" : undefined }} onPointerDown={handlePointerDownCanvas} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={handleWheel}>
					<CommonMarkers />
					<defs>
						<pattern id="isoGrid" width="60" height="51.9615" patternUnits="userSpaceOnUse">
							<circle cx="0" cy="0" r="1.5" fill="var(--background-modifier-border)" opacity="0.4" />
							<circle cx="30" cy="0" r="1.5" fill="var(--background-modifier-border)" opacity="0.4" />
							<circle cx="15" cy="25.9808" r="1.5" fill="var(--background-modifier-border)" opacity="0.4" />
							<circle cx="45" cy="25.9808" r="1.5" fill="var(--background-modifier-border)" opacity="0.4" />
							<circle cx="0" cy="51.9615" r="1.5" fill="var(--background-modifier-border)" opacity="0.4" />
							<circle cx="30" cy="51.9615" r="1.5" fill="var(--background-modifier-border)" opacity="0.4" />
						</pattern>
					</defs>
					<g transform={`translate(${readOnly ? 0 : pan.x}, ${readOnly ? 0 : pan.y}) scale(${readOnly ? 1 : scale})`}>
						{!readOnly && <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#isoGrid)" style={{ cursor: activeTool === 'pan' ? 'grab' : 'crosshair' }} />}
						{selectionBox && (
							<rect
								x={Math.min(selectionBox.start.x, selectionBox.current.x)}
								y={Math.min(selectionBox.start.y, selectionBox.current.y)}
								width={Math.abs(selectionBox.current.x - selectionBox.start.x)}
								height={Math.abs(selectionBox.current.y - selectionBox.start.y)}
								fill="var(--color-blue, #2080f0)" fillOpacity="0.1" stroke="var(--color-blue, #2080f0)" strokeWidth="1" strokeDasharray="4"
							/>
						)}
						{chainEnd && (activeTool === 'bond_single' || activeTool === 'bond_dotted') && (
							<line x1={chainEnd.x} y1={chainEnd.y} x2={mousePos.x} y2={mousePos.y} stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="6 4" />
						)}
						{drawingArrow && activeTool === 'reaction_arrow' && (
							<line x1={drawingArrow.start.x} y1={drawingArrow.start.y} x2={drawingArrow.current.x} y2={drawingArrow.current.y} stroke={currentColor || 'var(--text-normal)'} strokeWidth="2" strokeDasharray="4" markerEnd="url(#arrowhead)" />
						)}
						{drawingArrow && activeTool === 'reaction_reversible' && (() => {
							const dx = drawingArrow.current.x - drawingArrow.start.x;
							const dy = drawingArrow.current.y - drawingArrow.start.y;
							const len = Math.sqrt(dx * dx + dy * dy) || 1;
							const nx = -dy / len; const ny = dx / len;
							const offset = 3;
							return (
								<g>
									<line x1={drawingArrow.start.x - nx * offset} y1={drawingArrow.start.y - ny * offset} x2={drawingArrow.current.x - nx * offset} y2={drawingArrow.current.y - ny * offset} stroke={currentColor || 'var(--text-normal)'} strokeWidth="2" strokeDasharray="4" markerEnd="url(#harpoon-top)" />
									<line x1={drawingArrow.current.x + nx * offset} y1={drawingArrow.current.y + ny * offset} x2={drawingArrow.start.x + nx * offset} y2={drawingArrow.start.y + ny * offset} stroke={currentColor || 'var(--text-normal)'} strokeWidth="2" strokeDasharray="4" markerEnd="url(#harpoon-top)" />
								</g>
							);
						})()}
						{drawingArrow && activeTool === 'curly_arrow' && (() => {
							const c = getInitialControlPoint(drawingArrow.start, drawingArrow.current);
							return <path d={`M ${drawingArrow.start.x} ${drawingArrow.start.y} Q ${c.x} ${c.y} ${drawingArrow.current.x} ${drawingArrow.current.y}`} fill="none" stroke={currentColor || 'var(--text-normal)'} strokeWidth="2" strokeDasharray="4" markerEnd="url(#curlyhead)" />;
						})()}

						{bonds.map(b => b.x1 !== undefined && (
							<g key={b.id} onPointerDown={e => handlePointerDownBond(e, b.id)}>
								<line x1={b.x1} y1={b.y1!} x2={b.x2!} y2={b.y2!} stroke="transparent" strokeWidth="16" />
								<BondRenderer
									x1={b.x1} y1={b.y1!} x2={b.x2!} y2={b.y2!}
									type={b.type} selected={selectedIds.includes(b.id)} color={b.color} readOnly={readOnly}
								/>
							</g>
						))}

						{elements.map(el => {
							const isSelected = selectedIds.includes(el.id) && !readOnly;
							const w = Math.max(16, (el.text || '').length * 10 + 4);
							const h = 20;
							let rx = el.align === 'start' ? -10 : (el.align === 'end' ? -w + 10 : -w / 2);
							return (
								<g key={el.id} transform={`translate(${el.x}, ${el.y}) scale(${el.scale || 1})`}
									onPointerDown={e => {
										e.stopPropagation();
										if (e.button === 1 || activeTool === 'pan') { setDragItemType('pan'); return; }
										if (activeTool === 'select') {
											if (!e.shiftKey && !selectedIds.includes(el.id)) { setSelectedIds([el.id]); setNewElementText(el.text); }
											else if (e.shiftKey && !selectedIds.includes(el.id)) setSelectedIds([...selectedIds, el.id]);
											setDragNodeId(el.id); setDragItemType('multi_drag');
											setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, annotations, bonds });
										}
									}}
									style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}
								>
									<rect x={rx - 1} y={-h / 2} width={w + 2} height={h} fill="var(--background-primary)" />
									<ChemText text={el.text} color={el.color || "var(--text-normal)"} fontSize="16px" align={el.align} dx={el.align === 'start' ? -6 : (el.align === 'end' ? 6 : 0)} />
									{isSelected && activeTool === 'select' && (
										<rect x="8" y="8" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(el.id); }} />
									)}
								</g>
							);
						})}

						{annotations.map(ann => {
							const isSelected = selectedIds.includes(ann.id) && !readOnly;
							const strokeColor = isSelected ? "var(--color-red, #f02020)" : (ann.color || "var(--text-normal)");

							if (ann.type === 'benzene') {
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`}
										onPointerDown={e => {
											e.stopPropagation();
											if (activeTool === 'select') {
												if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
												else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([...selectedIds, ann.id]);
												setDragNodeId(ann.id); setDragItemType('multi_drag');
												setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, annotations, bonds });
											}
										}}
										style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}
									>
										{isSelected && <rect x="-35" y="-35" width="70" height="70" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<path d="M 0 -30 L 25.98 -15 L 25.98 15 L 0 30 L -25.98 15 L -25.98 -15 Z" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" strokeLinejoin="round" />
										<circle cx="0" cy="0" r="18" fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" />
										{isSelected && activeTool === 'select' && (
											<rect x="25" y="20" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							}
							if (ann.type === 'bracket_left' || ann.type === 'bracket_right') {
								const isLeft = ann.type === 'bracket_left';
								return (
									<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`}
										onPointerDown={e => {
											e.stopPropagation();
											if (activeTool === 'select') {
												if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
												else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([...selectedIds, ann.id]);
												setDragNodeId(ann.id); setDragItemType('multi_drag');
												setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, annotations, bonds });
											}
										}}
										style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}
									>
										{isSelected && <rect x={isLeft ? '-15' : '-10'} y="-35" width="25" height="70" fill="transparent" stroke="var(--color-red, #f02020)" strokeDasharray="2" />}
										<path d={isLeft ? "M 0 -30 L -10 -30 L -10 30 L 0 30" : "M 0 -30 L 10 -30 L 10 30 L 0 30"} fill="none" stroke={ann.color || "var(--text-normal)"} strokeWidth="2" strokeLinecap="square" />
										{isSelected && activeTool === 'select' && (
											<rect x={isLeft ? '-5' : '0'} y="25" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
										)}
									</g>
								);
							}
							if (ann.type.startsWith('reaction_') && ann.points) {
								const pts = ann.points!;
								const isReversible = ann.type === 'reaction_reversible';
								if (isReversible) {
									const dx = pts[1]!.x - pts[0]!.x; const dy = pts[1]!.y - pts[0]!.y;
									const len = Math.sqrt(dx * dx + dy * dy) || 1;
									const nx = -dy / len; const ny = dx / len;
									const offset = 3;
									const shorten = 8;
									const x1_short = pts[0]!.x + (dx / len) * shorten;
									const y1_short = pts[0]!.y + (dy / len) * shorten;
									const x2_short = pts[1]!.x - (dx / len) * shorten;
									const y2_short = pts[1]!.y - (dy / len) * shorten;

									return (
										<g key={ann.id}>
											<line x1={pts[1]!.x - (dx / len) * 0.1 - nx * offset} y1={pts[1]!.y - (dy / len) * 0.1 - ny * offset} x2={pts[1]!.x - nx * offset} y2={pts[1]!.y - ny * offset} stroke={strokeColor} strokeWidth="0.1" markerEnd={isSelected ? 'url(#harpoon-top-selected)' : 'url(#harpoon-top)'} />
											<line x1={pts[0]!.x - nx * offset} y1={pts[0]!.y - ny * offset} x2={x2_short - nx * offset} y2={y2_short - ny * offset}
												stroke={strokeColor} strokeWidth={(isSelected ? 3 : 2) * (ann.scale || 1)}
												onPointerDown={e => {
													e.stopPropagation();
													if (activeTool === 'select') {
														if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
														else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([...selectedIds, ann.id]);
														setDragNodeId(ann.id); setDragItemType('multi_drag');
														setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, annotations, bonds });
													}
												}}
												style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : 'default', pointerEvents: 'stroke' }}
											/>
											<line x1={pts[0]!.x + (dx / len) * 0.1 + nx * offset} y1={pts[0]!.y + (dy / len) * 0.1 + ny * offset} x2={pts[0]!.x + nx * offset} y2={pts[0]!.y + ny * offset} stroke={strokeColor} strokeWidth="0.1" markerEnd={isSelected ? 'url(#harpoon-top-selected)' : 'url(#harpoon-top)'} />
											<line x1={pts[1]!.x + nx * offset} y1={pts[1]!.y + ny * offset} x2={x1_short + nx * offset} y2={y1_short + ny * offset}
												stroke={strokeColor} strokeWidth={(isSelected ? 3 : 2) * (ann.scale || 1)}
												style={{ pointerEvents: 'none' }}
											/>
											{isSelected && activeTool === 'select' && (
												<>
													<circle cx={pts[0]!.x} cy={pts[0]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_start'); }} />
													<circle cx={pts[1]!.x} cy={pts[1]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_end'); }} />
													<rect x={pts[1]!.x + 10} y={pts[1]!.y + 10} width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
												</>
											)}
										</g>
									);
								}
								const dx = pts[1]!.x - pts[0]!.x; const dy = pts[1]!.y - pts[0]!.y;
								const len = Math.sqrt(dx * dx + dy * dy) || 1;
								const shorten = 8;
								const x2 = pts[1]!.x - (dx / len) * shorten;
								const y2 = pts[1]!.y - (dy / len) * shorten;
								return (
									<g key={ann.id}>
										<line x1={pts[1]!.x - (dx / len) * 0.1} y1={pts[1]!.y - (dy / len) * 0.1} x2={pts[1]!.x} y2={pts[1]!.y} stroke={strokeColor} strokeWidth="0.1" markerEnd={isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'} />
										<line x1={pts[0]!.x} y1={pts[0]!.y} x2={x2} y2={y2}
											stroke={strokeColor} strokeWidth={(isSelected ? 3 : 2) * (ann.scale || 1)}
											onPointerDown={e => {
												e.stopPropagation();
												if (activeTool === 'select') {
													if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
													else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([...selectedIds, ann.id]);
													setDragNodeId(ann.id); setDragItemType('multi_drag');
													setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, annotations, bonds });
												}
											}}
											style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : 'default', pointerEvents: 'stroke' }}
										/>
										{isSelected && activeTool === 'select' && (
											<>
												<circle cx={pts[0]!.x} cy={pts[0]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_start'); }} />
												<circle cx={pts[1]!.x} cy={pts[1]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_end'); }} />
												<rect x={pts[1]!.x + 10} y={pts[1]!.y + 10} width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
											</>
										)}
									</g>
								);
							}
							if (ann.type === 'curly_arrow' && ann.points) {
								const pts = ann.points;
								const c = ann.control || getInitialControlPoint(pts[0]!, pts[1]!);
								const dx = pts[1]!.x - c.x; const dy = pts[1]!.y - c.y;
								const len = Math.sqrt(dx * dx + dy * dy) || 1;
								const shorten = 8;
								const px = pts[1]!.x - (dx / len) * shorten;
								const py = pts[1]!.y - (dy / len) * shorten;
								return (
									<g key={ann.id}>
										<path d={`M ${px + (pts[1]!.x - px) * 0.99} ${py + (pts[1]!.y - py) * 0.99} L ${pts[1]!.x} ${pts[1]!.y}`} fill="none" stroke={strokeColor} strokeWidth="0.1" markerEnd={isSelected ? "url(#curlyhead-selected)" : (ann.color ? "url(#curlyhead-color)" : "url(#curlyhead)")} />
										<path d={`M ${pts[0]!.x} ${pts[0]!.y} Q ${c.x} ${c.y} ${px} ${py}`}
											fill="none" stroke={strokeColor} strokeWidth={(isSelected ? 3 : 2) * (ann.scale || 1)}
											onPointerDown={e => {
												e.stopPropagation();
												if (activeTool === 'select') {
													if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
													else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([...selectedIds, ann.id]);
													setDragNodeId(ann.id); setDragItemType('multi_drag');
													setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, annotations, bonds });
												}
											}}
											style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default', pointerEvents: 'stroke' }}
										/>
										{isSelected && activeTool === 'select' && (
											<>
												<line x1={pts[0]!.x} y1={pts[0]!.y} x2={c.x} y2={c.y} stroke="var(--text-muted)" strokeDasharray="2 2" />
												<line x1={pts[1]!.x} y1={pts[1]!.y} x2={c.x} y2={c.y} stroke="var(--text-muted)" strokeDasharray="2 2" />
												<circle cx={c.x} cy={c.y} r="6" fill="var(--color-blue, #2080f0)" cursor="move"
													onPointerDown={e => {
														e.stopPropagation();
														if (activeTool === 'select') {
															if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
															setDragNodeId(ann.id); setDragItemType('control');
														}
													}}
												/>
												<circle cx={pts[0]!.x} cy={pts[0]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_start'); }} />
												<circle cx={pts[1]!.x} cy={pts[1]!.y} r="5" fill="var(--color-green, #20f080)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('arrow_end'); }} />
											</>
										)}
									</g>
								);
							}
							return (
								<g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`}
									onPointerDown={e => {
										e.stopPropagation();
										if (activeTool === 'select') {
											if (!e.shiftKey && !selectedIds.includes(ann.id)) { setSelectedIds([ann.id]); setNewElementText(ann.value || ''); }
											else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([...selectedIds, ann.id]);
											setDragNodeId(ann.id); setDragItemType('multi_drag');
											setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, annotations, bonds });
										}
									}}
									style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}
								>
									{ann.type === 'electron_pair' ? (
										<>{ann.vertical ? (
											<><circle cx="0" cy="-3.5" r="2.5" fill={ann.color || "var(--text-normal)"} /><circle cx="0" cy="3.5" r="2.5" fill={ann.color || "var(--text-normal)"} /></>
										) : (
											<><circle cx="-3.5" cy="0" r="2.5" fill={ann.color || "var(--text-normal)"} /><circle cx="3.5" cy="0" r="2.5" fill={ann.color || "var(--text-normal)"} /></>
										)}</>
									) : (
										<ChemText text={ann.value || ''} color={ann.color || "var(--text-normal)"} fontSize={ann.type === 'text' ? "16px" : "14px"} align="middle" />
									)}
									{isSelected && activeTool === 'select' && (
										<rect x="8" y="8" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />
									)}
								</g>
							);
						})}
					</g>
				</svg>
			</div>
		</div>
	);
};
