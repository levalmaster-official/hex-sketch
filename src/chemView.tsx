import { TextFileView, WorkspaceLeaf } from 'obsidian';
import * as React from 'react';
import { Root, createRoot } from 'react-dom/client';
import { ChemistryCanvas } from './components/ChemistryCanvas';

export const VIEW_TYPE_CHEM = 'chem-view';

export class ChemFileView extends TextFileView {
	root: Root | null = null;
	reactComponentRef: any = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, clear: boolean): void {
		this.data = data;
		this.renderCanvas();
	}

	clear(): void {
		this.data = '{}';
		this.renderCanvas();
	}

	getViewType() {
		return VIEW_TYPE_CHEM;
	}

	getDisplayText() {
		return this.file ? this.file.basename : 'Chemistry Drawing';
	}

	async onOpen() {
		this.root = createRoot(this.contentEl);
		this.renderCanvas();
	}

	renderCanvas() {
		if (this.root) {
			this.root.render(
				<div style={{ width: '100%', height: '100%' }}>
					<ChemistryCanvas 
						initialData={this.data} 
						onChange={(newData) => {
							if (this.data !== newData) {
								this.data = newData;
								this.requestSave();
							}
						}} 
					/>
				</div>
			);
		}
	}

	async onClose() {
		this.root?.unmount();
	}
}
