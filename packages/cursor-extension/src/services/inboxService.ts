import fs from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { inboxDir, validateImportPayload } from "../shared/index.js";
import type { Services } from "../types.js";

export class InboxService {
  private watcher?: vscode.FileSystemWatcher;
  private importQueue: Promise<void> = Promise.resolve();

  constructor(private readonly services: Services) {}

  async importAll(): Promise<void> {
    const run = this.importQueue.then(() => this.runImportAll());
    this.importQueue = run.catch(() => undefined);
    await run;
  }

  private async runImportAll(): Promise<void> {
    const project = await this.services.project.load();
    if (!project) {
      vscode.window.showErrorMessage("CiteBridge project is not initialized. Run CiteBridge: Initialize LaTeX Project first.");
      return;
    }

    const dir = inboxDir(project.rootPath);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
    } catch {
      return;
    }

    let imported = 0;
    for (const file of files) {
      const fullPath = path.join(dir, file);
      imported += await this.importFile(fullPath);
    }

    if (imported > 0) {
      this.services.refreshTree();
      vscode.window.showInformationMessage(`CiteBridge imported ${imported} item(s).`);
    }
  }

  async handleUri(_uri: vscode.Uri): Promise<void> {
    await this.importAll();
  }

  async watch(): Promise<void> {
    const project = await this.services.project.load();
    if (!project) return;
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(project.rootPath, ".citebridge/inbox/*.json"));
    this.watcher.onDidCreate(() => this.importAll());
    this.services.context.subscriptions.push(this.watcher);
  }

  private async importFile(filePath: string): Promise<number> {
    const project = await this.services.project.load();
    if (!project) return 0;
    try {
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      const validation = validateImportPayload(raw);
      if (!validation.ok) throw new Error(validation.message);
      const imported = await this.services.importer.importPayload(project, validation.payload);
      await fs.rename(filePath, `${filePath}.processed`);
      return imported;
    } catch (error) {
      vscode.window.showErrorMessage(`CiteBridge failed to import ${path.basename(filePath)}: ${(error as Error).message}`);
      return 0;
    }
  }
}
