import * as React from 'react';
import { useApp } from './hooks';
import { ChemistryCanvas } from './components/ChemistryCanvas';
import { Notice } from 'obsidian';

export const ReactView = () => {
	const app = useApp();
	const [data, setData] = React.useState('{}');

	const saveAsFile = async () => {
		if (!app) return;
		let name = 'Drawing.chem';
		let i = 1;
		while (app.vault.getAbstractFileByPath(name)) {
			name = `Drawing ${i}.chem`;
			i++;
		}
		const file = await app.vault.create(name, data);
		new Notice(`Saved to ${name}!`);
		const leaf = app.workspace.getLeaf(true);
		await leaf.openFile(file);
	};

	return (
		<div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
			<div style={{ padding: '8px', borderBottom: '1px solid var(--background-modifier-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<h4 style={{ margin: 0 }}>{app ? app.vault.getName() + ' - ' : ''}Chemistry Drawings</h4>
				<button onClick={saveAsFile} className="mod-cta">Save as File</button>
			</div>
			<div style={{ flex: 1, minHeight: 0 }}>
				<ChemistryCanvas onChange={setData} />
			</div>
		</div>
	);
};
