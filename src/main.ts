import {App, Editor, MarkdownView, Modal, Notice, Plugin, TFile, SuggestModal} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import { ExampleView, VIEW_TYPE_EXAMPLE } from './view';
import { ChemFileView, VIEW_TYPE_CHEM } from './chemView';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ChemistryCanvas } from './components/ChemistryCanvas';
import { ChemSuggestModal } from './modals';

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => new ExampleView(leaf)
		);

		this.registerView(
			VIEW_TYPE_CHEM,
			(leaf) => new ChemFileView(leaf)
		);
		this.registerExtensions(['chem'], VIEW_TYPE_CHEM);

		// Add Command to create a new chem file
		this.addCommand({
			id: 'create-chem-file',
			name: 'Create new chemistry drawing',
			callback: async () => {
				let name = 'Untitled.chem';
				let i = 1;
				while (this.app.vault.getAbstractFileByPath(name)) {
					name = `Untitled ${i}.chem`;
					i++;
				}
				const file = await this.app.vault.create(name, '{}');
				const leaf = this.app.workspace.getLeaf(true);
				await leaf.openFile(file);
			}
		});

		// Add Command to embed a chem file into an active editor
		this.addCommand({
			id: 'insert-chem-embed',
			name: 'Embed chemistry drawing',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new ChemSuggestModal(this.app, (file: TFile) => {
					editor.replaceSelection(`\n\`\`\`chem\n[[${file.path}]]\nwidth: 100%\n\`\`\`\n`);
				}).open();
			}
		});

		// Add Command to export drawing
		this.addCommand({
			id: 'export-chemistry-drawing',
			name: 'Export Chemistry Drawing to SVG/PNG',
			callback: () => {
				new ExportFileModal(this.app, this).open();
			}
		});

		this.registerMarkdownCodeBlockProcessor("chem", async (source, el, ctx) => {
			const container = el.createEl("div");
			container.style.border = "1px solid var(--background-modifier-border)";
			container.style.borderRadius = "4px";
			container.style.overflow = "hidden";
			container.style.display = "flex";
			container.style.justifyContent = "center";
			container.style.margin = "0 auto";

			let data = source;
			let width = "100%";
			let height = undefined as string | undefined;

			const lines = source.split('\n');
			if (lines.length > 0 && lines[0]) {
				const firstLine = lines[0].trim();
				if (firstLine.startsWith("file:") || firstLine.startsWith("[[") || firstLine.match(/[\w\-\s]+\.chem/)) {
					let fileLink = firstLine.replace(/^file:\s*/, '').replace('[[', '').replace(']]', '').trim();
					if (!fileLink.endsWith('.chem')) fileLink += '.chem';
					
					const file = this.app.metadataCache.getFirstLinkpathDest(fileLink, ctx.sourcePath) || this.app.vault.getAbstractFileByPath(fileLink);
					if (file instanceof TFile) {
						data = await this.app.vault.read(file);
					} else {
						data = "{}";
						el.createEl('div', { text: `Error: File ${fileLink} not found.`, cls: 'error-notice' });
					}
				}

				for (let i = 1; i < lines.length; i++) {
					if (!lines[i]) continue;
					const line = lines[i]!.toLowerCase().trim();
					if (line.startsWith('width:')) {
						const val = line.split(':')[1];
						if (val) width = val.trim();
					}
					if (line.startsWith('height:')) {
						const val = line.split(':')[1];
						if (val) height = val.trim();
					}
				}
			}

			container.style.width = width;
			if (height) container.style.height = height;

			const root = createRoot(container);
			root.render(
				React.createElement(ChemistryCanvas, { initialData: data, readOnly: true, width, height })
			);
		});

		this.addRibbonIcon('hexagon', 'Open HexSketch sidebar', () => {
			this.activateView();
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ExportFileModal extends SuggestModal<TFile> {
	plugin: MyPlugin;
	constructor(app: App, plugin: MyPlugin) { super(app); this.plugin = plugin; }
	getSuggestions(query: string): TFile[] { return this.app.vault.getFiles().filter(f => f.extension === 'chem' && f.name.toLowerCase().includes(query.toLowerCase())); }
	renderSuggestion(file: TFile, el: HTMLElement) { el.createEl('div', { text: file.name }); }
	onChooseSuggestion(file: TFile) { new ExportFormatModal(this.app, this.plugin, file).open(); }
}

class ExportFormatModal extends SuggestModal<string> {
	plugin: MyPlugin;
	file: TFile;
	constructor(app: App, plugin: MyPlugin, file: TFile) { super(app); this.plugin = plugin; this.file = file; }
	getSuggestions(query: string): string[] { return ['SVG', 'PNG'].filter(f => f.toLowerCase().includes(query.toLowerCase())); }
	renderSuggestion(format: string, el: HTMLElement) { el.createEl('div', { text: `Export as ${format}` }); }
	async onChooseSuggestion(format: string) {
		const content = await this.app.vault.read(this.file);
		const hiddenContainer = document.createElement('div');
		hiddenContainer.style.visibility = 'hidden';
		hiddenContainer.style.position = 'absolute';
		hiddenContainer.style.width = '800px';
		hiddenContainer.style.height = '600px';
		document.body.appendChild(hiddenContainer);
		
		const root = createRoot(hiddenContainer);
		root.render(React.createElement(ChemistryCanvas, { initialData: content, readOnly: true }));
		
		setTimeout(async () => {
			const svgElement = hiddenContainer.querySelector('svg') as SVGSVGElement | null;
			if (!svgElement) {
				new Notice('Failed to parse SVG from file.');
				root.unmount(); document.body.removeChild(hiddenContainer); return;
			}
			const serializer = new XMLSerializer();
			let source = serializer.serializeToString(svgElement);
			if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
			
			source = source.replace(/var\(--text-normal(?:,\s*[^)]+)?\)/g, '#000000');
			source = source.replace(/var\(--background-primary(?:,\s*[^)]+)?\)/g, '#ffffff');
			source = source.replace(/var\(--background-modifier-border(?:,\s*[^)]+)?\)/g, '#cccccc');
			source = source.replace(/var\(--color-red(?:,\s*[^)]+)?\)/g, '#f02020');
			source = source.replace(/var\(--color-blue(?:,\s*[^)]+)?\)/g, '#2080f0');
			source = source.replace(/context-stroke/g, 'currentColor'); // Fallback for some SVG parsers
			
			const destPath = this.file.path.replace(/\.chem$/, `.${format.toLowerCase()}`);
			if (format === 'SVG') {
				const existing = this.app.vault.getAbstractFileByPath(destPath);
				if (existing) await this.app.vault.trash(existing, false);
				await this.app.vault.create(destPath, source);
				new Notice(`Exported safely to ${destPath}`);
			} else if (format === 'PNG') {
				const img = new Image();
				const svgBlob = new Blob([source], {type: "image/svg+xml;charset=utf-8"});
				const url = URL.createObjectURL(svgBlob);
				img.onload = async () => {
					const canvas = document.createElement('canvas');
					canvas.width = svgElement.viewBox.baseVal?.width || 800;
					canvas.height = svgElement.viewBox.baseVal?.height || 600;
					if (canvas.width === 0) canvas.width = 800;
					if (canvas.height === 0) canvas.height = 600;
					
					const ctx = canvas.getContext('2d');
					if (ctx) {
						ctx.fillStyle = "white";
						ctx.fillRect(0, 0, canvas.width, canvas.height);
						ctx.drawImage(img, 0, 0);
						canvas.toBlob(async (blob) => {
							if (blob) {
								const buffer = await blob.arrayBuffer();
								const existing = this.app.vault.getAbstractFileByPath(destPath);
								if (existing) await this.app.vault.trash(existing, false);
								await this.app.vault.createBinary(destPath, buffer);
								new Notice(`Exported safely to ${destPath}`);
							}
						});
					}
					URL.revokeObjectURL(url);
					root.unmount(); document.body.removeChild(hiddenContainer);
				};
				img.src = url;
				return;
			}
			root.unmount(); document.body.removeChild(hiddenContainer);
		}, 300);
	}
}
