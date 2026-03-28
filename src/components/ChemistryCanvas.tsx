import React, { useState, useEffect } from 'react';
import { DrawingMode, ElementNode, Bond, Annotation } from './chemistryTypes';
import { DisplayedView } from './DisplayedView';
import { SkeletalView } from './SkeletalView';

export const ChemistryCanvas: React.FC<{
	initialData?: string, 
	onChange?: (data: string) => void, 
	readOnly?: boolean,
	width?: string,
	height?: string
}> = ({initialData, onChange, readOnly, width, height}) => {
	const [mode, setMode] = useState<DrawingMode>('displayed');

	useEffect(() => {
		if (initialData) {
			try {
				const d = JSON.parse(initialData);
				if (d.mode) setMode(d.mode);
			} catch(e) {}
		}
	}, [initialData]);

	const handleModeChange = (newMode: DrawingMode) => {
		setMode(newMode);
		if (onChange) {
			try {
				const d = initialData ? JSON.parse(initialData) : { elements: [], bonds: [], annotations: [] };
				d.mode = newMode;
				onChange(JSON.stringify(d, null, 2));
			} catch(e) {}
		}
	};

	const d = initialData ? JSON.parse(initialData) : { elements: [], bonds: [], annotations: [] };
	const isBlank = (!d.elements || d.elements.length === 0) && (!d.bonds || d.bonds.length === 0) && (!d.annotations || d.annotations.length === 0);

	const containerStyle = {
		width: width || '100%',
		height: height || '100%',
		aspectRatio: (!height && width && width !== '100%') ? '4/3' : undefined,
		display: 'flex',
		flexDirection: 'column' as any
	};

	return (
		<div style={containerStyle}>
			{mode === 'displayed' && (
				<DisplayedView initialData={initialData} onChange={onChange} readOnly={readOnly} mode={mode} setMode={handleModeChange} isBlank={isBlank} />
			)}
			{mode === 'skeletal' && (
				<SkeletalView initialData={initialData} onChange={onChange} readOnly={readOnly} mode={mode} setMode={handleModeChange} isBlank={isBlank} />
			)}
			{mode === '3d' && (
				<div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
					<div style={{ padding: '8px', borderBottom: '1px solid var(--background-modifier-border)' }}>
						<button onClick={() => handleModeChange('displayed')}>Switch to Displayed View</button>
						<button onClick={() => handleModeChange('skeletal')} style={{ marginLeft: '8px' }}>Switch to Skeletal View</button>
					</div>
					<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<h2>3D Rendering Component (Coming Soon)</h2>
					</div>
				</div>
			)}
		</div>
	);
};
