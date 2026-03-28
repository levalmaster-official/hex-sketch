import React, { useState, useEffect } from 'react';
import { Tool, DrawingMode } from './chemistryTypes';

interface ThreeDToolbarProps {
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

export const ThreeDToolbar: React.FC<ThreeDToolbarProps> = (props) => {
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
		if (!favColors.includes(color)) {
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

	const showTextInput = props.activeTool === 'element' || props.activeTool === 'group' || props.activeTool === 'text' || props.showEditInput;
	const showAlignSelect = props.activeTool === 'group' || props.showEditInput;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--background-modifier-border)', padding: '8px', gap: '8px' }}>
			{/* Mode Switcher */}
			<div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
				{modeBtn('displayed', 'Displayed')}
				{modeBtn('skeletal', 'Skeletal')}
				{modeBtn('3d', '3D')}
			</div>

			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>

				{/* Group 1: Select / Pan / Undo */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					<button onClick={props.handleUndo} disabled={!props.canUndo}>Undo</button>
					<div style={{ width: '1px', background: 'var(--background-modifier-border)', height: '20px', margin: '0 4px' }} />
					{toolBtn('select', 'Select')}
					{toolBtn('pan', 'Pan')}
					{props.selectedIds.length > 0 && (
						<button onClick={props.handleDelete} style={{ color: 'var(--text-error)' }}>Delete</button>
					)}
				</div>

				{/* Group 2: Element & Label placement */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					{toolBtn('element', 'Element', 'Click to place element')}
					{toolBtn('group', 'Group', 'Group with alignment (OH, HO)')}
					{toolBtn('text', 'Text', 'Free text label')}

					{showTextInput && (
						<input
							type="text"
							value={props.newElementText}
							onChange={e => props.handleTextChange(e.target.value)}
							style={{ width: '70px' }}
							placeholder="C, CH3, COOH..."
						/>
					)}

					{showAlignSelect && (
						<select value={props.groupAlign} onChange={e => props.setGroupAlign(e.target.value as any)}>
							<option value="middle">Centered</option>
							<option value="start">Bind Left (OH)</option>
							<option value="end">Bind Right (HO)</option>
						</select>
					)}
				</div>

				{/* Group 3: Bonds */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					{toolBtn('bond_single', 'Single', 'Single bond — drag between atoms')}
					{toolBtn('bond_double', 'Double', 'Double bond')}
					{toolBtn('bond_triple', 'Triple', 'Triple bond')}
					<div style={{ width: '1px', background: 'var(--background-modifier-border)', height: '20px', margin: '0 4px' }} />
					{toolBtn('bond_wedge', '▲ Wedge', 'Solid wedge — bond coming toward viewer (narrow end at source)')}
					{toolBtn('bond_dash', '▽ Dash', 'Dashed wedge — bond going away from viewer')}
					<div style={{ width: '1px', background: 'var(--background-modifier-border)', height: '20px', margin: '0 4px' }} />
					{toolBtn('bond_dotted', 'Dotted', 'Dotted bond')}
				</div>

				{/* Group 4: Annotations */}
				<div style={{ display: 'flex', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
					{toolBtn('charge_plus', '+', 'Add + charge')}
					{toolBtn('charge_minus', '−', 'Add − charge')}
					{toolBtn('delta_plus', 'δ+', 'Delta plus')}
					{toolBtn('delta_minus', 'δ−', 'Delta minus')}
					<div style={{ width: '1px', background: 'var(--background-modifier-border)', height: '20px', margin: '0 4px' }} />
					{toolBtn('mirror_line', '⟊ Mirror', 'Draw a dashed mirror/symmetry line')}
				</div>

				{/* Group 5: Color */}
				<div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--background-secondary)', padding: '6px', borderRadius: '6px' }}>
					<input
						type="color"
						value={props.currentColor || '#aaaaaa'}
						onChange={e => props.setCurrentColor(e.target.value)}
						style={{ width: '28px', height: '28px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
						title="Choose custom color"
					/>
					<button onClick={() => addFavColor(props.currentColor)} title="Save" style={{ padding: '4px 8px' }}>+</button>
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
		</div>
	);
};
