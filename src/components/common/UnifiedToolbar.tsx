import React, { useState, useEffect } from 'react';
import { Tool, DrawingMode } from '../chemistryTypes';

interface UnifiedToolbarProps {
	mode: DrawingMode;
	setMode: (mode: DrawingMode) => void;
	activeTool: Tool;
	setActiveTool: (tool: Tool) => void;
	handleUndo: () => void;
	canUndo: boolean;
	selectedIds: string[];
	handleDelete: () => void;
	newElementText: string;
	handleTextChange: (text: string) => void;
	showEditInput: boolean;
	groupAlign: 'start' | 'middle' | 'end';
	setGroupAlign: (align: 'start' | 'middle' | 'end') => void;
	currentColor: string;
	setCurrentColor: (color: string) => void;
	isBlank?: boolean;
}

const PRESET_COLORS = ['', '#f02020', '#2080f0', '#20f080', '#f0a020', '#a020f0'];

export const UnifiedToolbar: React.FC<UnifiedToolbarProps> = (props) => {
	const [favColors, setFavColors] = useState<string[]>(PRESET_COLORS);

	useEffect(() => {
		try {
			const stored = localStorage.getItem('hexsketch-fav-colors');
			if (stored) {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed) && parsed.length > 0) setFavColors(parsed);
			}
		} catch {}
	}, []);

	const addFavColor = (color: string) => {
		if (color && !favColors.includes(color)) {
			const newFavs = [...favColors, color];
			setFavColors(newFavs);
			localStorage.setItem('hexsketch-fav-colors', JSON.stringify(newFavs));
		}
	};

	const modeBtn = (m: DrawingMode, label: string) => {
		const locked = !props.isBlank && props.mode !== m;
		return (
			<button
				onClick={() => props.setMode(m)}
				className={props.mode === m ? 'mod-cta' : ''}
				disabled={locked}
				style={{ opacity: locked ? 0.5 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
			>{label}</button>
		);
	};

	const toolBtn = (tool: Tool, label: string, title?: string) => (
		<button
			onClick={() => props.setActiveTool(tool)}
			className={props.activeTool === tool ? 'mod-cta' : ''}
			title={title}
		>{label}</button>
	);

	const isTextInputVisible = ['element', 'group', 'text', 'heteroatom'].includes(props.activeTool) || props.showEditInput;
	const isAlignSelectVisible = ['group', 'heteroatom'].includes(props.activeTool) || props.showEditInput;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--background-modifier-border)', padding: '8px', gap: '8px' }}>
			{/* Mode Switcher */}
			<div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
				{modeBtn('displayed', 'Displayed')}
				{modeBtn('skeletal', 'Skeletal')}
				{modeBtn('3d', '3D')}
			</div>

			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
				{/* History & Select */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					<button onClick={props.handleUndo} disabled={!props.canUndo}>Undo</button>
					<div style={{ width: '1px', background: 'var(--background-modifier-border)', height: '20px', margin: '0 4px' }} />
					{toolBtn('select', 'Select')}
					{toolBtn('pan', 'Pan')}
					{props.selectedIds.length > 0 && (
						<button onClick={props.handleDelete} style={{ color: 'var(--text-error)' }}>Delete</button>
					)}
				</div>

				{/* Elements / Heteroatoms */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					{props.mode === 'skeletal' ? 
						toolBtn('heteroatom', 'Heteroatom', 'Place an element on a vertex') : 
						<>
							{toolBtn('element', 'Element')}
							{toolBtn('group', 'Group')}
						</>
					}
					{toolBtn('text', 'Text')}
					
					{isTextInputVisible && (
						<input type="text" value={props.newElementText} onChange={e => props.handleTextChange(e.target.value)} style={{ width: '60px' }} />
					)}
					
					{isAlignSelectVisible && (
						<select value={props.groupAlign} onChange={e => props.setGroupAlign(e.target.value as any)}>
							<option value="middle">Center</option>
							<option value="start">{props.mode === 'displayed' ? 'Bind Left (OH)' : 'Left'}</option>
							<option value="end">{props.mode === 'displayed' ? 'Bind Right (HO)' : 'Right'}</option>
						</select>
					)}
				</div>

				{/* Bonds */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					{props.mode === 'skeletal' ? (
						<>
							{toolBtn('bond_single', 'Chain', 'Skeletal Chain')}
							{toolBtn('bond_double_skeletal', 'C=C', 'Internal Double Bond')}
							{toolBtn('bond_triple_skeletal', 'C#C', 'Internal Triple Bond')}
							{toolBtn('benzene', 'Benzene', 'Benzene Ring')}
						</>
					) : (
						<>
							{toolBtn('bond_single', 'Single')}
							{toolBtn('bond_double', 'Double')}
							{toolBtn('bond_triple', 'Triple')}
							{toolBtn('bond_dotted', 'Dotted')}
						</>
					)}
					{props.mode === '3d' && (
						<>
							{toolBtn('bond_wedge', '▲ Wedge')}
							{toolBtn('bond_dash', '▽ Dash')}
						</>
					)}
				</div>

				{props.mode === 'skeletal' && (
					<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
						{toolBtn('bond_double', 'Double', 'Generic Double Bond')}
						{toolBtn('bond_triple', 'Triple', 'Generic Triple Bond')}
						{toolBtn('bond_dotted', 'Dotted', 'Dotted Bond')}
					</div>
				)}

				{/* Annotations */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					{toolBtn('charge_plus', '+')}
					{toolBtn('charge_minus', '−')}
					{toolBtn('delta_plus', 'δ⁺')}
					{toolBtn('delta_minus', 'δ⁻')}
					{props.mode !== '3d' && (
						<>
							{toolBtn('electron_pair_v', ':')}
							{toolBtn('electron_pair_h', '..')}
						</>
					)}
					{toolBtn('curly_arrow', 'Curly arrow')}
					{props.mode === '3d' && toolBtn('mirror_line', '⟊ Mirror')}
					{props.mode === 'skeletal' && (
						<>
							{toolBtn('bracket_left', '[')}
							{toolBtn('bracket_right', ']')}
						</>
					)}
				</div>

				{/* Reaction */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					{toolBtn('reaction_arrow', '→')}
					{toolBtn('reaction_reversible', '⇌')}
				</div>

				{/* Color */}
				<div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px' }}>
					<input
						type="color"
						value={props.currentColor || '#aaaaaa'}
						onChange={e => props.setCurrentColor(e.target.value)}
						style={{ width: '28px', height: '28px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
					/>
					<button onClick={() => addFavColor(props.currentColor)} style={{ padding: '4px 8px' }}>+</button>
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
								title={c === '' ? 'Default' : c}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};
