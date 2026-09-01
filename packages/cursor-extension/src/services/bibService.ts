import fs from "node:fs/promises";
import path from "node:path";
import {
  createMinimalBibtex,
  withBibtexKey,
  type ZoteroPayloadItem
} from "../shared/index.js";
import type { LoadedProject } from "../types.js";

export class BibService {
  async ensureBibtex(
    project: LoadedProject,
    item: ZoteroPayloadItem,
    citekey: string,
    previousCitekey?: string
  ): Promise<{ added: boolean; bibtex: string }> {
    const bibPath = path.join(project.rootPath, project.config.bibFile);
    const existing = await this.readBibFile(bibPath);
    const fetched = await this.fetchZoteroBibtex(project, item);
    const bibtex = withBibtexKey(item.bibtex || fetched || createMinimalBibtex(item, citekey), citekey);
    const match = findBibtexEntry(existing, [citekey, previousCitekey].filter((key): key is string => !!key), item.doi);
    if (match) {
      const before = existing.slice(0, match.start).trimEnd();
      const after = existing.slice(match.end).trimStart();
      const updated = [before, bibtex.trim(), after].filter(Boolean).join("\n\n") + "\n";
      if (updated !== existing) await fs.writeFile(bibPath, updated, "utf8");
      return { added: false, bibtex };
    }

    const separator = existing.trim().length > 0 ? "\n\n" : "";
    await fs.writeFile(bibPath, `${existing.trimEnd()}${separator}${bibtex}\n`, "utf8");
    return { added: true, bibtex };
  }

  private async readBibFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      return "";
    }
  }

  private async fetchZoteroBibtex(project: LoadedProject, item: ZoteroPayloadItem): Promise<string | undefined> {
    if (!project.config.zoteroLocalApi.enabled) return undefined;
    const baseUrl = project.config.zoteroLocalApi.baseUrl.replace(/\/$/, "");
    const librarySegment = item.libraryType === "group" ? `groups/${item.libraryId}` : `users/${item.libraryId || "0"}`;
    try {
      const response = await fetch(`${baseUrl}/${librarySegment}/items/${item.itemKey}?format=bibtex`);
      if (!response.ok) return undefined;
      const text = await response.text();
      return text.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}

type BibtexEntryRange = { start: number; end: number };

function findBibtexEntry(content: string, citekeys: string[], doi?: string): BibtexEntryRange | undefined {
  const header = /@\w+\s*([({])\s*([^,\s]+)\s*,/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(content))) {
    const open = match[1];
    const close = open === "{" ? "}" : ")";
    let depth = 1;
    let index = header.lastIndex;
    let quoted = false;
    let escaped = false;
    for (; index < content.length; index += 1) {
      const char = content[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') quoted = !quoted;
      if (quoted) continue;
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
      if (depth === 0) break;
    }
    if (depth !== 0) continue;

    const entry = content.slice(match.index, index + 1);
    const keyMatches = citekeys.includes(match[2]);
    const doiMatches = !!doi && entryHasDoi(entry, doi);
    if (keyMatches || doiMatches) return { start: match.index, end: index + 1 };
    header.lastIndex = index + 1;
  }
  return undefined;
}

function entryHasDoi(entry: string, doi: string): boolean {
  const normalizedDoi = normalizeDoi(doi);
  const field = entry.match(/\bdoi\s*=\s*[\{"']([^\}"']+)[\}"']?/i)?.[1];
  return !!field && normalizeDoi(field) === normalizedDoi;
}

function normalizeDoi(value: string): string {
  return value.toLowerCase().trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/\s+/g, "");
}
