import React, { useState, useEffect } from 'react';
import { Tool, DrawingMode } from './chemistryTypes';

interface ChemistryToolbarProps {
	mode: DrawingMode;
	setMode: (mode: DrawingMode) => void;
	activeTool: Tool;
	setActiveTool: (tool: Tool) => void;
	handleUndo: () => void;
	canUndo: boolean;
	selectedIds: string[];
	handleDelete: () => void;
	newElementText: string;
	setNewElementText: (text: string) => void;
	handleTextChange: (text: string) => void;
	showEditInput: boolean;
	groupAlign: 'start' | 'middle' | 'end';
	setGroupAlign: (align: 'start' | 'middle' | 'end') => void;
	currentColor: string;
	setCurrentColor: (color: string) => void;
	isBlank?: boolean;
}

const PRESET_COLORS = ['', '#f02020', '#2080f0', '#20f080', '#f0a020', '#a020f0'];

export const SkeletalToolbar: React.FC<ChemistryToolbarProps> = (props) => {
	const [favColors, setFavColors] = useState<string[]>(PRESET_COLORS);

	useEffect(() => {
		try {
			const stored = localStorage.getItem('hexsketch-fav-colors');
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed) && parsed.length > 0) {
					setFavColors(parsed);
				}
			}
		} catch { }
	}, []);

	const addFavColor = (color: string) => {
		if (!favColors.includes(color)) {
			const newFavs = [...favColors, color];
			setFavColors(newFavs);
			localStorage.setItem('hexsketch-fav-colors', JSON.stringify(newFavs));
		}
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--background-modifier-border)', padding: '8px', gap: '8px' }}>
			{/* Mode Switcher */}
			<div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
				<button
					onClick={() => props.setMode('displayed')}
					className={props.mode === 'displayed' ? 'mod-cta' : ''}
					disabled={!props.isBlank && props.mode !== 'displayed'}
					style={{ opacity: (!props.isBlank && props.mode !== 'displayed') ? 0.5 : 1, cursor: (!props.isBlank && props.mode !== 'displayed') ? 'not-allowed' : 'pointer' }}
				>Displayed</button>
				<button
					onClick={() => props.setMode('skeletal')}
					className={props.mode === 'skeletal' ? 'mod-cta' : ''}
					disabled={!props.isBlank && props.mode !== 'skeletal'}
					style={{ opacity: (!props.isBlank && props.mode !== 'skeletal') ? 0.5 : 1, cursor: (!props.isBlank && props.mode !== 'skeletal') ? 'not-allowed' : 'pointer' }}
				>Skeletal</button>
				<button
					onClick={() => props.setMode('3d')}
					className={props.mode === '3d' ? 'mod-cta' : ''}
					disabled={!props.isBlank && props.mode !== '3d'}
					style={{ opacity: (!props.isBlank && props.mode !== '3d') ? 0.5 : 1, cursor: (!props.isBlank && props.mode !== '3d') ? 'not-allowed' : 'pointer' }}
				>3D</button>
			</div>

			{/* Tool Groups */}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>

				{/* Group 1: Select/Pan/Undo */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					<button onClick={props.handleUndo} disabled={!props.canUndo}>Undo</button>
					<div style={{ width: '1px', background: 'var(--background-modifier-border)', height: '20px', margin: '0 4px' }}></div>
					<button onClick={() => props.setActiveTool('select')} className={props.activeTool === 'select' ? 'mod-cta' : ''}>Select</button>
					<button onClick={() => props.setActiveTool('pan')} className={props.activeTool === 'pan' ? 'mod-cta' : ''}>Pan</button>
					{props.selectedIds.length > 0 && <button onClick={props.handleDelete} style={{ color: 'var(--text-error)' }}>Delete</button>}
				</div>

				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					<button onClick={() => props.setActiveTool('bond_single')} className={props.activeTool === 'bond_single' ? 'mod-cta' : ''} title="Skeletal Chain">Chain</button>
					<button onClick={() => props.setActiveTool('bond_double_skeletal')} className={props.activeTool === 'bond_double_skeletal' ? 'mod-cta' : ''} title="C=C Double Bond (Internal)">C=C</button>
					<button onClick={() => props.setActiveTool('bond_triple_skeletal')} className={props.activeTool === 'bond_triple_skeletal' ? 'mod-cta' : ''} title="C≡C Triple Bond (Internal)">C#C</button>
					<button onClick={() => props.setActiveTool('benzene')} className={props.activeTool === 'benzene' ? 'mod-cta' : ''} title="Benzene Ring">Benzene</button>
				</div>

				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					<button onClick={() => props.setActiveTool('bond_double')} className={props.activeTool === 'bond_double' ? 'mod-cta' : ''} title="Generic Double Bond">Double</button>
					<button onClick={() => props.setActiveTool('bond_triple')} className={props.activeTool === 'bond_triple' ? 'mod-cta' : ''} title="Generic Triple Bond">Triple</button>
					<button onClick={() => props.setActiveTool('bond_dotted')} className={props.activeTool === 'bond_dotted' ? 'mod-cta' : ''} title="Dotted/Temporary Bond">Dotted</button>
				</div>

				{/* Group 3: Heteroatom & Text */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					<button
						onClick={() => props.setActiveTool('heteroatom')}
						className={(props.activeTool === 'heteroatom' || props.activeTool === 'group') ? 'mod-cta' : ''}
						title="Place an element or multi-atom group"
					>Group / Heteroatom</button>
					<button onClick={() => props.setActiveTool('text')} className={props.activeTool === 'text' ? 'mod-cta' : ''}>Text</button>

					{(props.activeTool === 'heteroatom' || props.activeTool === 'group' || props.activeTool === 'text' || props.showEditInput) && (
						<input type="text" value={props.newElementText} onChange={e => props.handleTextChange(e.target.value)} style={{ width: '64px' }} placeholder="O, N, OH..." />
					)}

					{(props.activeTool === 'heteroatom' || props.activeTool === 'group' || props.showEditInput) && (
						<select value={props.groupAlign} onChange={e => props.setGroupAlign(e.target.value as any)}>
							<option value="middle">Centered</option>
							<option value="start">Bind Left (OH)</option>
							<option value="end">Bind Right (HO)</option>
						</select>
					)}

					<div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
						<input
							type="color"
							value={props.currentColor || '#aaaaaa'}
							onChange={e => props.setCurrentColor(e.target.value)}
							style={{ width: '28px', height: '28px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
							title="Choose custom color"
						/>
						<button onClick={() => addFavColor(props.currentColor)} title="Save current color" style={{ padding: '4px 8px' }}>+</button>
						<div style={{ display: 'flex', gap: '4px' }}>
							{favColors.map(c => (
								<div
									key={c}
									onClick={() => props.setCurrentColor(c)}
									style={{
										width: '20px', height: '20px', backgroundColor: c || 'var(--text-normal)',
										cursor: 'pointer', borderRadius: '50%',
										boxShadow: props.currentColor === c ? '0 0 0 2px var(--color-blue, #2080f0)' : '0 0 0 1px var(--background-modifier-border)'
									}}
									title={c === '' ? 'Theme Default' : c}
								/>
							))}
						</div>
					</div>
				</div>

				{/* Group 4: Annotations */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px' }}>
					<button onClick={() => props.setActiveTool('charge_plus')} className={props.activeTool === 'charge_plus' ? 'mod-cta' : ''}>+</button>
					<button onClick={() => props.setActiveTool('charge_minus')} className={props.activeTool === 'charge_minus' ? 'mod-cta' : ''}>-</button>
					<button onClick={() => props.setActiveTool('delta_plus')} className={props.activeTool === 'delta_plus' ? 'mod-cta' : ''}>δ+</button>
					<button onClick={() => props.setActiveTool('delta_minus')} className={props.activeTool === 'delta_minus' ? 'mod-cta' : ''}>δ-</button>
					<button onClick={() => props.setActiveTool('electron_pair_v')} className={props.activeTool === 'electron_pair_v' ? 'mod-cta' : ''}>:</button>
					<button onClick={() => props.setActiveTool('electron_pair_h')} className={props.activeTool === 'electron_pair_h' ? 'mod-cta' : ''}>..</button>
					<button onClick={() => props.setActiveTool('curly_arrow')} className={props.activeTool === 'curly_arrow' ? 'mod-cta' : ''}>Curly Arrow</button>
					<button onClick={() => props.setActiveTool('bracket_left')} className={props.activeTool === 'bracket_left' ? 'mod-cta' : ''} title="Left Bracket">[</button>
					<button onClick={() => props.setActiveTool('bracket_right')} className={props.activeTool === 'bracket_right' ? 'mod-cta' : ''} title="Right Bracket">]</button>
				</div>

				{/* Group 5: Reactions */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px' }}>
					<button onClick={() => props.setActiveTool('reaction_arrow')} className={props.activeTool === 'reaction_arrow' ? 'mod-cta' : ''}>→</button>
					<button onClick={() => props.setActiveTool('reaction_reversible')} className={props.activeTool === 'reaction_reversible' ? 'mod-cta' : ''}>⇌</button>
				</div>

			</div>
		</div>
	);
};
