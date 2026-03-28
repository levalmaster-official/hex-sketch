import React, { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { ElementNode, Bond, BondType, Annotation, AnnotationType, Tool, DrawingMode } from './chemistryTypes';
import { useCanvas, generateId, getInitialControlPoint } from './common/useCanvas';
import { useNavigation } from './common/useNavigation';
import { UnifiedToolbar } from './common/UnifiedToolbar';
import { ChemText, CommonMarkers, BondRenderer } from './common/ChemPrimitives';

const labelRadius = (el: ElementNode) => {
	if (!el.text || el.text === '') return 0;
	const s = el.scale || 1;
	if (el.align === 'start' || el.align === 'end') return 10 * s;
	return (el.text.length * 4.5 + 6) * s;
};

export const ThreeDView: React.FC<{ initialData?: string; onChange?: (data: string) => void; readOnly?: boolean; mode: DrawingMode; setMode: (m: DrawingMode) => void; isBlank?: boolean; }> = ({ initialData, onChange, readOnly, mode, setMode, isBlank }) => {
	const { elements, setElements, bonds, setBonds, annotations, setAnnotations, history, pushHistory, undo, deleteSelection } = useCanvas({ initialData, onChange, readOnly, mode });
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const { scale, setScale, pan, setPan, getMouseCoords, handleWheel } = useNavigation(svgRef, containerRef, readOnly);

	const [activeTool, setActiveTool] = useState<Tool>('element');
	const [newElementText, setNewElementText] = useState('C');
	const [groupAlign, setGroupAlign] = useState<'start' | 'middle' | 'end'>('middle');
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [currentColor, setCurrentColor] = useState<string>('');

	const [dragNodeId, setDragNodeId] = useState<string | null>(null);
	const [dragItemType, setDragItemType] = useState<'multi_drag' | 'control' | 'arrow_start' | 'arrow_end' | 'pan' | 'resize' | 'mirror_start' | 'mirror_end' | null>(null);
	const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
	const [dragInitialState, setDragInitialState] = useState<{ elements: ElementNode[], bonds: Bond[], annotations: Annotation[] } | null>(null);
	const [selectionBox, setSelectionBox] = useState<{ start: { x: number, y: number }, current: { x: number, y: number } } | null>(null);

	const [bondFrom, setBondFrom] = useState<string | null>(null);
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
	const [drawingMirror, setDrawingMirror] = useState<{ start: { x: number, y: number }, current: { x: number, y: number } } | null>(null);
	const [drawingArrow, setDrawingArrow] = useState<{ start: { x: number, y: number }, current: { x: number, y: number } } | null>(null);

	useEffect(() => {
		if (readOnly && elements.length > 0) {
			const xs = elements.map(e => e.x); const ys = elements.map(e => e.y);
			const minX = Math.min(...xs); const maxX = Math.max(...xs);
			const minY = Math.min(...ys); const maxY = Math.max(...ys);
			setPan({ x: -(minX + maxX) / 2 + 150, y: -(minY + maxY) / 2 + 150 });
		}
	}, [readOnly, elements.length]);

	const handleUndo = useCallback(() => { undo(); setSelectedIds([]); }, [undo]);
	const handleDelete = useCallback(() => { deleteSelection(selectedIds); setSelectedIds([]); }, [deleteSelection, selectedIds]);

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

	const handleTextChange = (text: string) => {
		setNewElementText(text);
		if (selectedIds.length === 1) {
			const id = selectedIds[0];
			const el = elements.find(e => e.id === id);
			if (el) { pushHistory(); setElements(elements.map(e => e.id === id ? { ...e, text } : e)); return; }
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

	const isBondTool = (t: Tool) => t.startsWith('bond_');
	const findElementAt = (x: number, y: number, threshold = 22) => elements.find(el => Math.sqrt((x - el.x) ** 2 + (y - el.y) ** 2) < threshold);

	const handlePointerDownCanvas = (e: ReactMouseEvent) => {
		if (e.button === 1 || activeTool === 'pan') { setDragItemType('pan'); return; }
		if (readOnly) return;
		const coords = getMouseCoords(e);
		if (activeTool === 'select') { if (!e.shiftKey) setSelectedIds([]); setSelectionBox({ start: coords, current: coords }); setBondFrom(null); return; }
		if (activeTool === 'mirror_line') { setDrawingMirror({ start: coords, current: coords }); return; }
		if (activeTool === 'reaction_arrow' || activeTool === 'reaction_reversible' || activeTool === 'curly_arrow') { setDrawingArrow({ start: coords, current: coords }); return; }
		if (isBondTool(activeTool) && bondFrom) {
			if (!findElementAt(coords.x, coords.y)) {
				pushHistory(); const newEl = { id: generateId(), text: newElementText, x: coords.x, y: coords.y, color: currentColor || undefined, align: groupAlign };
				const bType = activeTool.replace('bond_', '') as BondType;
				setElements([...elements, newEl]); setBonds([...bonds, { id: generateId(), from: bondFrom, to: newEl.id, type: bType, color: currentColor || undefined }]); setBondFrom(newEl.id);
			}
			return;
		}
		if (activeTool === 'element' || activeTool === 'group') { pushHistory(); setElements([...elements, { id: generateId(), text: newElementText, x: coords.x, y: coords.y, color: currentColor || undefined, align: groupAlign }]); }
		else if (activeTool === 'text') { pushHistory(); setAnnotations([...annotations, { id: generateId(), type: 'text', x: coords.x, y: coords.y, value: newElementText, color: currentColor || undefined }]); }
		else if (activeTool.startsWith('charge_') || activeTool.startsWith('delta_')) {
			pushHistory();
			const val = activeTool.includes('plus') ? (activeTool.startsWith('delta') ? 'δ⁺' : '+') : (activeTool.startsWith('delta') ? 'δ⁻' : '−');
			setAnnotations([...annotations, { id: generateId(), type: activeTool.startsWith('delta') ? 'delta_charge' : 'charge', x: coords.x, y: coords.y, value: val, color: currentColor || undefined }]);
		}
		else if (activeTool === 'reaction_plus') { pushHistory(); setAnnotations([...annotations, { id: generateId(), type: 'reaction_plus', x: coords.x, y: coords.y, value: '+', color: currentColor || undefined }]); }
	};

	const handlePointerMove = (e: ReactMouseEvent) => {
		if (dragItemType === 'pan') { setPan({ x: pan.x + e.movementX, y: pan.y + e.movementY }); return; }
		if (readOnly) return;
		const coords = getMouseCoords(e); setMousePos(coords);
		if (selectionBox) setSelectionBox({ ...selectionBox, current: coords });
		if (drawingMirror) setDrawingMirror({ ...drawingMirror, current: coords });
		if (drawingArrow) setDrawingArrow({ ...drawingArrow, current: coords });
		if (dragNodeId && activeTool === 'select') {
			if (dragItemType === 'multi_drag' && dragInitialState) {
				const dx = coords.x - dragStartPos.x; const dy = coords.y - dragStartPos.y;
				setElements(dragInitialState.elements.map(el => selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
				setAnnotations(dragInitialState.annotations.map(a => selectedIds.includes(a.id) ? { ...a, x: a.points ? a.x : a.x + dx, y: a.points ? a.y : a.y + dy, points: a.points?.map(p => ({ x: p.x + dx, y: p.y + dy })), control: a.control ? { x: a.control.x + dx, y: a.control.y + dy } : undefined } : a));
			} else if (dragItemType && ['mirror_start', 'mirror_end', 'arrow_start', 'arrow_end', 'control'].includes(dragItemType)) {
				setAnnotations(annotations.map(a => a.id === dragNodeId ? (dragItemType === 'control' ? { ...a, control: coords } : (dragItemType.includes('start') ? { ...a, points: [coords, a.points![1]!] } : { ...a, points: [a.points![0]!, coords] })) : a));
			} else if (dragItemType === 'resize') {
				const el = elements.find(e => e.id === dragNodeId);
				if (el) setElements(elements.map(e => e.id === dragNodeId ? { ...e, scale: Math.max(0.2, Math.sqrt((coords.x - el.x) ** 2 + (coords.y - el.y) ** 2) / 15) } : e));
				else { const ann = annotations.find(a => a.id === dragNodeId); if (ann) setAnnotations(annotations.map(a => a.id === dragNodeId ? { ...a, scale: Math.max(0.2, Math.sqrt((coords.x - (ann.points?.[0]?.x || ann.x)) ** 2 + (coords.y - (ann.points?.[0]?.y || ann.y)) ** 2) / (ann.points ? Math.sqrt((ann.points[1]!.x - ann.points[0]!.x) ** 2 + (ann.points[1]!.y - ann.points[0]!.y) ** 2) : 15)) } : a)); }
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
			annotations.forEach(a => { if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) newSel.push(a.id); });
			setSelectedIds(prev => Array.from(new Set([...prev, ...newSel]))); setSelectionBox(null);
		}
		if (drawingMirror || drawingArrow) {
			pushHistory();
			const type = (drawingMirror ? 'mirror_line' : activeTool) as AnnotationType;
			const pts = drawingMirror ? [drawingMirror.start, drawingMirror.current] : [drawingArrow!.start, drawingArrow!.current];
			setAnnotations([...annotations, {
				id: generateId(), type, x: pts[0]!.x, y: pts[0]!.y,
				points: pts,
				control: getInitialControlPoint(pts[0]!, pts[1]!),
				color: currentColor || undefined
			}]);
			setDrawingMirror(null); setDrawingArrow(null); setActiveTool('select');
		}
		setDragNodeId(null); setDragItemType(null); setDragInitialState(null);
	};

	let viewBoxFull = undefined;
	if (readOnly) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const inc = (x: number, y: number) => { if (isNaN(x) || isNaN(y)) return; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
		elements.forEach(el => { inc(el.x - 20, el.y - 20); inc(el.x + 20, el.y + 20); });
		annotations.forEach(a => {
			if (a.points) a.points.forEach(p => inc(p.x, p.y));
			else { inc(a.x - 15, a.y - 15); inc(a.x + 15, a.y + 15); }
		});
		bonds.forEach(b => {
			const f = elements.find(e => e.id === b.from);
			const t = elements.find(e => e.id === b.to);
			if (f && t) { inc(f.x, f.y); inc(t.x, t.y); }
		});
		if (minX !== Infinity) { const pad = 15; viewBoxFull = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`; }
	}

	return (
		<div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: readOnly ? 'auto' : undefined }}>
			{!readOnly && <UnifiedToolbar mode={mode} setMode={setMode} activeTool={activeTool} setActiveTool={t => { setActiveTool(t); setBondFrom(null); setDrawingMirror(null); }} handleUndo={handleUndo} canUndo={history.length > 0} selectedIds={selectedIds} handleDelete={handleDelete} newElementText={newElementText} handleTextChange={handleTextChange} showEditInput={selectedIds.length === 1} groupAlign={groupAlign} setGroupAlign={setGroupAlign} currentColor={currentColor} setCurrentColor={handleColorChange} isBlank={isBlank} />}
			<div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: readOnly ? 'transparent' : 'var(--background-primary)' }}>
				<svg ref={svgRef} width="100%" height={readOnly && viewBoxFull ? 'auto' : '100%'} viewBox={viewBoxFull} style={{ touchAction: 'none', maxHeight: readOnly ? '500px' : undefined }} onPointerDown={handlePointerDownCanvas} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onWheel={handleWheel}>
					<CommonMarkers />
					{!readOnly && isBondTool(activeTool) && !bondFrom && <rect x="-10000" y="-10000" width="20000" height="20000" fill="transparent" style={{ cursor: 'crosshair' }} />}
					<g transform={`translate(${readOnly ? 0 : pan.x}, ${readOnly ? 0 : pan.y}) scale(${readOnly ? 1 : scale})`}>
						{selectionBox && <rect x={Math.min(selectionBox.start.x, selectionBox.current.x)} y={Math.min(selectionBox.start.y, selectionBox.current.y)} width={Math.abs(selectionBox.current.x - selectionBox.start.x)} height={Math.abs(selectionBox.current.y - selectionBox.start.y)} fill="var(--color-blue, #2080f0)" fillOpacity="0.1" stroke="var(--color-blue, #2080f0)" strokeWidth="1" strokeDasharray="4" />}
						{bondFrom && isBondTool(activeTool) && elements.find(e => e.id === bondFrom) && (() => {
							const fromEl = elements.find(e => e.id === bondFrom)!;
							return <line x1={fromEl.x} y1={fromEl.y} x2={mousePos.x} y2={mousePos.y} stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="6 4" />;
						})()}
						{drawingMirror && <line x1={drawingMirror.start.x} y1={drawingMirror.start.y} x2={drawingMirror.current.x} y2={drawingMirror.current.y} stroke={currentColor || 'var(--text-muted)'} strokeWidth="2" strokeDasharray="8 5" />}
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
						{(drawingArrow && activeTool === 'curly_arrow') && (() => {
							const c = getInitialControlPoint(drawingArrow.start, drawingArrow.current);
							return <g>
								<path d={`M ${drawingArrow.start.x} ${drawingArrow.start.y} Q ${c.x} ${c.y} ${drawingArrow.current.x} ${drawingArrow.current.y}`} fill="none" stroke={currentColor || 'var(--text-normal)'} strokeWidth="0.1" markerEnd="url(#curlyhead)" />
								<path d={`M ${drawingArrow.start.x} ${drawingArrow.start.y} Q ${c.x} ${c.y} ${drawingArrow.current.x} ${drawingArrow.current.y}`} fill="none" stroke={currentColor || 'var(--text-normal)'} strokeWidth="1.5" strokeDasharray="4" />
							</g>;
						})()}
						{bonds.map(b => { const f = elements.find(e => e.id === b.from); const t = elements.find(e => e.id === b.to); if (!f || !t) return null; const dx = t.x - f.x; const dy = t.y - f.y; const len = Math.sqrt(dx * dx + dy * dy); const r1 = labelRadius(f) + (['wedge', 'dash'].includes(b.type) ? 4 : 0); const r2 = labelRadius(t) + (['wedge', 'dash'].includes(b.type) ? 4 : 0); return <g key={b.id} onPointerDown={e => { if (readOnly) return; e.stopPropagation(); if (activeTool === 'select') { if (!e.shiftKey) setSelectedIds([b.id]); else if (!selectedIds.includes(b.id)) setSelectedIds(p => [...p, b.id]); } else if (isBondTool(activeTool)) { pushHistory(); setBonds(p => p.map(x => x.id === b.id ? { ...x, type: activeTool.replace('bond_', '') as BondType, color: currentColor || undefined } : x)); } }} style={{ cursor: (activeTool === 'select' || isBondTool(activeTool)) && !readOnly ? 'pointer' : 'default' }}><line x1={f.x + dx / len * r1} y1={f.y + dy / len * r1} x2={t.x - dx / len * r2} y2={t.y - dy / len * r2} stroke="transparent" strokeWidth="14" /><BondRenderer x1={f.x + dx / len * r1} y1={f.y + dy / len * r1} x2={t.x - dx / len * r2} y2={t.y - dy / len * r2} type={b.type} selected={selectedIds.includes(b.id)} color={b.color} readOnly={readOnly} /></g>; })}
						{elements.map(el => { const isSelected = selectedIds.includes(el.id) && !readOnly; return <g key={el.id} transform={`translate(${el.x}, ${el.y}) scale(${el.scale || 1})`} onPointerDown={e => { e.stopPropagation(); if (e.button === 1 || activeTool === 'pan') { setDragItemType('pan'); return; } if (activeTool === 'select') { if (!e.shiftKey && !selectedIds.includes(el.id)) { setSelectedIds([el.id]); setNewElementText(el.text); } else if (e.shiftKey && !selectedIds.includes(el.id)) setSelectedIds(p => [...p, el.id]); setDragNodeId(el.id); setDragItemType('multi_drag'); setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, bonds, annotations }); } else if (isBondTool(activeTool)) { if (!bondFrom) setBondFrom(el.id); else { if (bondFrom !== el.id) { pushHistory(); setBonds(p => [...p, { id: generateId(), from: bondFrom, to: el.id, type: activeTool.replace('bond_', '') as BondType, color: currentColor || undefined }]); } setBondFrom(el.id); } } }} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : (isBondTool(activeTool) ? 'pointer' : 'default') }}><rect x={el.align === 'start' ? -4 : (el.align === 'end' ? -36 : -20)} y="-10" width="40" height="20" fill="var(--background-primary)" opacity="0" /><ChemText text={el.text} color={el.color || 'var(--text-normal)'} fontSize='15px' align={el.align} dx={el.align === 'start' ? -6 : (el.align === 'end' ? 6 : 0)} />{bondFrom === el.id && <circle r="16" fill="none" stroke="var(--color-blue, #2080f0)" strokeWidth="2" strokeDasharray="3 2" />}{isSelected && <circle r="16" fill="none" stroke="var(--color-red, #f02020)" strokeWidth="2" strokeDasharray="3 2" />}{isSelected && activeTool === 'select' && <rect x="10" y="10" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(el.id); }} />}</g>; })}
						{annotations.map(ann => {
							const isSelected = selectedIds.includes(ann.id) && !readOnly; const strokeColor = isSelected ? 'var(--color-red, #f02020)' : (ann.color || 'var(--text-normal)');
							if (ann.type === 'mirror_line' && ann.points) { const [p0, p1] = ann.points; return <g key={ann.id} onPointerDown={e => { e.stopPropagation(); if (activeTool === 'select') { if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]); else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds(p => [...p, ann.id]); setDragNodeId(ann.id); setDragItemType('multi_drag'); setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, bonds, annotations }); } }}><line x1={p0!.x} y1={p0!.y} x2={p1!.x} y2={p1!.y} stroke="transparent" strokeWidth="12" style={{ cursor: 'pointer' }} /><line x1={p0!.x} y1={p0!.y} x2={p1!.x} y2={p1!.y} stroke={strokeColor} strokeWidth="1.5" strokeDasharray="10 6" />{isSelected && activeTool === 'select' && <><circle cx={p0!.x} cy={p0!.y} r="5" fill="var(--color-blue, #2080f0)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('mirror_start'); }} /><circle cx={p1!.x} cy={p1!.y} r="5" fill="var(--color-blue, #2080f0)" cursor="move" onPointerDown={e => { e.stopPropagation(); setSelectedIds([ann.id]); setDragNodeId(ann.id); setDragItemType('mirror_end'); }} /><rect x={p1!.x + 10} y={p1!.y + 10} width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} /></>}</g>; }
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
									const g1_start = pts[1]!.x - (dx / len) * 0.1;
									const g1_y_start = pts[1]!.y - (dy / len) * 0.1;
									const g2_start = pts[0]!.x + (dx / len) * 0.1;
									const g2_y_start = pts[0]!.y + (dy / len) * 0.1;

									return (
										<g key={ann.id}>
											<line x1={g1_start - nx * offset} y1={g1_y_start - ny * offset} x2={pts[1]!.x - nx * offset} y2={pts[1]!.y - ny * offset} stroke={strokeColor} strokeWidth="0.1" markerEnd={isSelected ? 'url(#harpoon-top-selected)' : 'url(#harpoon-top)'} />
											<line x1={pts[0]!.x - nx * offset} y1={pts[0]!.y - ny * offset} x2={x2_short - nx * offset} y2={y2_short - ny * offset}
												stroke={strokeColor} strokeWidth={(isSelected ? 3 : 2) * (ann.scale || 1)}
												onPointerDown={e => {
													e.stopPropagation();
													if (activeTool === 'select') {
														if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
														else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds(p => [...p, ann.id]);
														setDragNodeId(ann.id); setDragItemType('multi_drag');
														setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, bonds, annotations });
													}
												}}
												style={{ cursor: activeTool === 'select' && !readOnly ? 'pointer' : 'default', pointerEvents: 'stroke' }}
											/>
											<line x1={g2_start + nx * offset} y1={g2_y_start + ny * offset} x2={pts[0]!.x + nx * offset} y2={pts[0]!.y + ny * offset} stroke={strokeColor} strokeWidth="0.1" markerEnd={isSelected ? 'url(#harpoon-top-selected)' : 'url(#harpoon-top)'} />
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
													else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds(p => [...p, ann.id]);
													setDragNodeId(ann.id); setDragItemType('multi_drag');
													setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, bonds, annotations });
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
								const gX = pts[1]!.x - (dx / len) * 0.1;
								const gY = pts[1]!.y - (dy / len) * 0.1;
								return (
									<g key={ann.id}>
										<path d={`M ${gX} ${gY} L ${pts[1]!.x} ${pts[1]!.y}`} fill="none" stroke={strokeColor} strokeWidth="0.1" markerEnd={isSelected ? "url(#curlyhead-selected)" : (ann.color ? "url(#curlyhead-color)" : "url(#curlyhead)")} />
										<path d={`M ${pts[0]!.x} ${pts[0]!.y} Q ${c.x} ${c.y} ${px} ${py}`}
											fill="none" stroke={strokeColor} strokeWidth={(isSelected ? 3 : 2) * (ann.scale || 1)}
											onPointerDown={e => {
												e.stopPropagation();
												if (activeTool === 'select') {
													if (!e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds([ann.id]);
													else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds(p => [...p, ann.id]);
													setDragNodeId(ann.id); setDragItemType('multi_drag');
													setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, bonds, annotations });
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
							return <g key={ann.id} transform={`translate(${ann.x}, ${ann.y}) scale(${ann.scale || 1})`} onPointerDown={e => { e.stopPropagation(); if (activeTool === 'select') { if (!e.shiftKey && !selectedIds.includes(ann.id)) { setSelectedIds([ann.id]); setNewElementText(ann.value || ''); } else if (e.shiftKey && !selectedIds.includes(ann.id)) setSelectedIds(p => [...p, ann.id]); setDragNodeId(ann.id); setDragItemType('multi_drag'); setDragStartPos(getMouseCoords(e)); setDragInitialState({ elements, bonds, annotations }); } }} style={{ cursor: activeTool === 'select' && !readOnly ? 'move' : 'default' }}><ChemText text={ann.value || ''} color={ann.color || 'var(--text-normal)'} fontSize='14px' align='middle' />{isSelected && activeTool === 'select' && <rect x="8" y="8" width="6" height="6" fill="var(--color-blue, #2080f0)" cursor="se-resize" onPointerDown={e => { e.stopPropagation(); setDragItemType('resize'); setDragNodeId(ann.id); }} />}</g>;
						})}
					</g>
				</svg>
			</div>
		</div>
	);
};
