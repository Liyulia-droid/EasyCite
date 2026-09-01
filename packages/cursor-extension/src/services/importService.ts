import path from "node:path";
import * as vscode from "vscode";
import { creatorDisplayName, generateCitekey, type ImportPayload, type ZoteroPayloadItem } from "../shared/index.js";
import type { LoadedProject } from "../types.js";
import { BibService } from "./bibService.js";
import { PdfService } from "./pdfService.js";
import { writeJson } from "./json.js";

export class ImportService {
  private readonly pdf = new PdfService();

  constructor(private readonly bib: BibService) {}

  async importPayload(project: LoadedProject, payload: ImportPayload): Promise<number> {
    if (project.index.processedRequests.includes(payload.requestId)) return 0;
    if (payload.targetProjectId !== project.config.projectId) throw new Error("Payload targets a different CiteBridge project.");
    if (payload.projectToken !== project.config.security.projectToken) throw new Error("Payload project token does not match.");

    let imported = 0;
    for (const item of payload.items) {
      const changed = await this.importItem(project, item);
      if (changed) imported += 1;
    }

    project.index.processedRequests.push(payload.requestId);
    await projectServiceSave(project);
    return imported;
  }

  private async importItem(project: LoadedProject, item: ZoteroPayloadItem): Promise<boolean> {
    const duplicate = project.index.items.find((entry) => {
      const sameZotero = entry.zotero.itemKey === item.itemKey && entry.zotero.libraryId === item.libraryId;
      const sameDoi = item.doi && entry.doi?.toLowerCase() === item.doi.toLowerCase();
      return sameZotero || sameDoi;
    });
    const existingKeys = project.index.items.filter((entry) => entry !== duplicate).map((entry) => entry.citekey);
    const generatedCitekey = item.preferredCitationKey ?? generateCitekey(item, existingKeys);
    const previousCitekey = duplicate?.citekey;
    const repairLegacyUnknown = !!duplicate && duplicate.citekey.startsWith("Unknown") && !generatedCitekey.startsWith("Unknown");
    const citekey = duplicate && !repairLegacyUnknown ? duplicate.citekey : generatedCitekey;
    const bib = await this.bib.ensureBibtex(project, item, citekey, repairLegacyUnknown ? previousCitekey : undefined);
    const pdfResult = await this.pdf.copyPdf(project, item, citekey);
    if (pdfResult.warning) {
      vscode.window.showWarningMessage(`CiteBridge: ${pdfResult.warning}`);
    }
    const pdf = pdfResult.pdf;
    const now = new Date().toISOString();
    const authors = item.creators?.map(creatorDisplayName).filter(Boolean) ?? [];

    if (duplicate) {
      duplicate.citekey = citekey;
      duplicate.title = item.title || duplicate.title;
      duplicate.authors = authors.length ? authors : duplicate.authors;
      duplicate.year = item.year || duplicate.year;
      duplicate.doi = item.doi || duplicate.doi;
      duplicate.pdf = pdf || duplicate.pdf;
      duplicate.bibtex = bib.bibtex;
      duplicate.bibtexAdded = duplicate.bibtexAdded || bib.added;
      duplicate.updatedAt = now;
      await writeJson(path.join(project.rootPath, ".citebridge", "items", `${citekey}.json`), sanitizeStoredItem(item));
      return true;
    }

    project.index.items.push({
      citekey,
      title: item.title || citekey,
      authors,
      year: item.year || "",
      doi: item.doi,
      zotero: {
        libraryType: item.libraryType,
        libraryId: item.libraryId,
        itemKey: item.itemKey
      },
      bibFile: project.config.bibFile,
      pdf,
      bibtex: bib.bibtex,
      bibtexAdded: bib.added,
      createdAt: now,
      updatedAt: now
    });
    await writeJson(path.join(project.rootPath, ".citebridge", "items", `${citekey}.json`), sanitizeStoredItem(item));
    return true;
  }
}

function sanitizeStoredItem(item: ZoteroPayloadItem): ZoteroPayloadItem {
  return {
    ...item,
    attachments: item.attachments?.map((attachment) => ({
      type: attachment.type,
      title: attachment.title,
      filename: attachment.filename
    }))
  };
}

async function projectServiceSave(project: LoadedProject): Promise<void> {
  await writeJson(path.join(project.rootPath, ".citebridge", "index.json"), project.index);
}
