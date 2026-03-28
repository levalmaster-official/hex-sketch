import React from 'react';
import { BondType } from '../chemistryTypes';

export const ChemText: React.FC<{ text: string; color: string; fontSize: string; align?: 'start' | 'middle' | 'end'; dx?: number; dy?: number }> = 
({ text, color, fontSize, align = 'middle', dx = 0, dy = 0 }) => {
	const segments: { text: string; type: 'normal' | 'sub' | 'super' }[] = [];
	let current = "";
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '_' || text[i] === '^') {
			if (current) segments.push({ text: current, type: 'normal' });
			current = "";
			const isSub = text[i] === '_';
			i++;
			if (i < text.length && text[i] === '{') {
				let j = i + 1;
				while (j < text.length && text[j] !== '}') {
					current += text[j];
					j++;
				}
				segments.push({ text: current, type: isSub ? 'sub' : 'super' });
				current = "";
				i = j;
			} else if (i < text.length) {
				segments.push({ text: text[i]!, type: isSub ? 'sub' : 'super' });
			}
		} else {
			current += text[i];
		}
	}
	if (current) segments.push({ text: current, type: 'normal' });

	return (
		<text textAnchor={align} dominantBaseline="central" fill={color} fontWeight="bold" fontSize={fontSize} dx={dx} dy={dy} style={{ userSelect: 'none' }}>
			{segments.map((s, idx) => (
				<tspan key={idx} baselineShift={s.type === 'sub' ? '-33%' : s.type === 'super' ? '33%' : '0'} fontSize={s.type === 'normal' ? '1em' : '0.65em'}>
					{s.text}
				</tspan>
			))}
		</text>
	);
};

export const CommonMarkers = () => (
	<defs>
		<marker id="harpoon-top" markerWidth="10" markerHeight="8" refX="10" refY="3" orient="auto" markerUnits="userSpaceOnUse">
			<path d="M 0 0 L 10 4 L 0 4 Z" fill="context-stroke" />
		</marker>
		<marker id="harpoon-top-selected" markerWidth="10" markerHeight="8" refX="10" refY="3" orient="auto" markerUnits="userSpaceOnUse">
			<path d="M 0 0 L 10 4 L 0 4 Z" fill="var(--color-red, #f02020)" />
		</marker>
		<marker id="harpoon-top-color" markerWidth="10" markerHeight="8" refX="10" refY="3" orient="auto" markerUnits="userSpaceOnUse">
			<path d="M 0 0 L 10 4 L 0 4 Z" fill="context-stroke" />
		</marker>
		<marker id="harpoon-bottom" markerWidth="10" markerHeight="8" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
			<path d="M 0 8 L 10 4 L 0 4 Z" fill="context-stroke" />
		</marker>
		<marker id="harpoon-bottom-selected" markerWidth="10" markerHeight="8" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
			<path d="M 0 8 L 10 4 L 0 4 Z" fill="var(--color-red, #f02020)" />
		</marker>
		<marker id="arrowhead" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
			<polygon points="0 0, 10 4, 0 8" fill="context-stroke" />
		</marker>
		<marker id="arrowhead-selected" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
			<polygon points="0 0, 10 4, 0 8" fill="var(--color-red, #f02020)" />
		</marker>
		<marker id="curlyhead" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
			<polygon points="0 0, 10 4, 0 8" fill="context-stroke" />
		</marker>
		<marker id="curlyhead-selected" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
			<polygon points="0 0, 10 4, 0 8" fill="var(--color-red, #f02020)" />
		</marker>
		<marker id="curlyhead-color" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="userSpaceOnUse">
			<polygon points="0 0, 10 4, 0 8" fill="context-stroke" />
		</marker>
	</defs>
);

export const BondRenderer: React.FC<{
	x1: number, y1: number, x2: number, y2: number,
	type: BondType, selected?: boolean, color?: string, readOnly?: boolean
}> = ({ x1, y1, x2, y2, type, selected, color, readOnly }) => {
	const dx = x2 - x1; const dy = y2 - y1;
	const len = Math.sqrt(dx*dx + dy*dy);
	if (len === 0) return null;
	const ux = dx/len; const uy = dy/len;
	const nx = -uy; const ny = ux;

	const strokeCol = selected && !readOnly ? "var(--color-red, #f02020)" : (color || "var(--text-normal)");
	const sw = selected && !readOnly ? 3 : 2;
	const OFFSET = 4;

	if (type === 'wedge') {
		const hw = 7;
		const pts = `${x1},${y1} ${x2 + nx*hw},${y2 + ny*hw} ${x2 - nx*hw},${y2 - ny*hw}`;
		return <polygon points={pts} fill={strokeCol} stroke={strokeCol} strokeWidth="1" strokeLinejoin="round" />;
	}

	if (type === 'dash') {
		const N = Math.max(4, Math.round(len / 7));
		const hw = 7;
		return (
			<g>
				{Array.from({ length: N + 1 }).map((_, i) => {
					const t = i / N;
					const cx = x1 + t * dx; const cy = y1 + t * dy;
					const curHw = t * hw;
					return <line key={i} x1={cx - nx*curHw} y1={cy - ny*curHw} x2={cx + nx*curHw} y2={cy + ny*curHw} stroke={strokeCol} strokeWidth={sw} strokeLinecap="round" />;
				})}
			</g>
		);
	}

	if (type === 'double') {
		return (
			<g>
				<line x1={x1 - nx*OFFSET} y1={y1 - ny*OFFSET} x2={x2 - nx*OFFSET} y2={y2 - ny*OFFSET} stroke={strokeCol} strokeWidth={sw} />
				<line x1={x1 + nx*OFFSET} y1={y1 + ny*OFFSET} x2={x2 + nx*OFFSET} y2={y2 + ny*OFFSET} stroke={strokeCol} strokeWidth={sw} />
			</g>
		);
	}

	if (type === 'triple') {
		return (
			<g>
				<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} />
				<line x1={x1 - nx*OFFSET*2} y1={y1 - ny*OFFSET*2} x2={x2 - nx*OFFSET*2} y2={y2 - ny*OFFSET*2} stroke={strokeCol} strokeWidth={sw} />
				<line x1={x1 + nx*OFFSET*2} y1={y1 + ny*OFFSET*2} x2={x2 + nx*OFFSET*2} y2={y2 + ny*OFFSET*2} stroke={strokeCol} strokeWidth={sw} />
			</g>
		);
	}

	if (type === 'double_skeletal') {
		const shrink = 4;
		const sx1 = x1 + ux*shrink; const sy1 = y1 + uy*shrink;
		const sx2 = x2 - ux*shrink; const sy2 = y2 - uy*shrink;
		return (
			<g>
				<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} />
				<line x1={sx1 + nx*OFFSET} y1={sy1 + ny*OFFSET} x2={sx2 + nx*OFFSET} y2={sy2 + ny*OFFSET} stroke={strokeCol} strokeWidth={sw} />
			</g>
		);
	}

	if (type === 'triple_skeletal') {
		const shrink = 4;
		const sx1 = x1 + ux*shrink; const sy1 = y1 + uy*shrink;
		const sx2 = x2 - ux*shrink; const sy2 = y2 - uy*shrink;
		return (
			<g>
				<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} />
				<line x1={sx1 + nx*OFFSET*1.5} y1={sy1 + ny*OFFSET*1.5} x2={sx2 + nx*OFFSET*1.5} y2={sy2 + ny*OFFSET*1.5} stroke={strokeCol} strokeWidth={sw} />
				<line x1={sx1 - nx*OFFSET*1.5} y1={sy1 - ny*OFFSET*1.5} x2={sx2 - nx*OFFSET*1.5} y2={sy2 - ny*OFFSET*1.5} stroke={strokeCol} strokeWidth={sw} />
			</g>
		);
	}

	return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeCol} strokeWidth={sw} strokeLinecap="round" strokeDasharray={type === 'dotted' ? "4 4" : "none"} />;
};
