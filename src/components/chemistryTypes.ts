export type ElementNode = { id: string; text: string; x: number; y: number; color?: string; scale?: number; align?: 'start' | 'middle' | 'end' };
export type BondType = 'single' | 'double' | 'triple' | 'dotted';
export type Bond = { id: string; from: string; to: string; type: BondType; x1?: number; y1?: number; x2?: number; y2?: number; color?: string };
export type AnnotationType = 'charge' | 'electron_pair' | 'delta_charge' | 'curly_arrow' | 'reaction_plus' | 'reaction_arrow' | 'reaction_reversible' | 'text' | 'benzene' | 'bracket_left' | 'bracket_right';
export type Annotation = { 
	id: string; 
	type: AnnotationType; 
	x: number; 
	y: number; 
	value?: string; 
	points?: {x: number, y: number}[];
	control?: {x: number, y: number};
	vertical?: boolean;
	color?: string;
	scale?: number;
	align?: 'start' | 'middle' | 'end';
};

export type Tool = 
	| 'select' 
	| 'pan'
	| 'element' | 'group' | 'text' 
	| 'bond_single' | 'bond_double' | 'bond_triple' | 'bond_dotted' 
	| 'charge_plus' | 'charge_minus' | 'electron_pair_v' | 'electron_pair_h' | 'delta_plus' | 'delta_minus' | 'curly_arrow'
	| 'reaction_plus' | 'reaction_arrow' | 'reaction_reversible'
	| 'vertex' | 'heteroatom'
	| 'benzene' | 'bracket_left' | 'bracket_right';

export type HistoryState = { elements: ElementNode[], bonds: Bond[], annotations: Annotation[] };
export type DrawingMode = 'displayed' | 'skeletal' | '3d';
