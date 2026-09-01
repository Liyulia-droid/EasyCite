var CiteBridgeContent = {
  pluginID: "citebridge@easycite.com",
  registeredMenuID: null,
  registeredCollectionMenuID: null,
  menuItemID: "citebridge-send-to-cursor-menuitem",
  menuSeparatorID: "citebridge-send-to-cursor-separator",
  collectionMenuItemID: "citebridge-sync-collection-menuitem",
  collectionMenuSeparatorID: "citebridge-sync-collection-separator",

  async registerMenus(pluginID) {
    this.pluginID = pluginID;
    Zotero.debug("CiteBridge: registerMenus");
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      await this.installWindowMenu(win);
    }
  },

  async unregisterMenus() {
    if (this.registeredMenuID) {
      Zotero.MenuManager.unregisterMenu(this.registeredMenuID);
      this.registeredMenuID = null;
    }
    if (this.registeredCollectionMenuID) {
      Zotero.MenuManager.unregisterMenu(this.registeredCollectionMenuID);
      this.registeredCollectionMenuID = null;
    }
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      await this.uninstallWindowMenu(win);
    }
  },

  async installWindowMenu(win) {
    const doc = win.document;
    const itemMenu = doc.getElementById("zotero-itemmenu");
    if (itemMenu && !doc.getElementById(this.menuItemID)) {
      const separator = doc.createXULElement("menuseparator");
      separator.id = this.menuSeparatorID;

      const menuItem = doc.createXULElement("menuitem");
      menuItem.id = this.menuItemID;
      menuItem.setAttribute("label", "发送到 VS Code 项目");
      menuItem.addEventListener("command", async () => {
        await CiteBridgeContent.runSendSelectedItems();
      });

      const refreshState = () => {
        menuItem.disabled = this.getSelectedRegularItems().length === 0;
      };
      itemMenu.addEventListener("popupshowing", refreshState);
      menuItem._citebridgeRefreshState = refreshState;

      itemMenu.appendChild(separator);
      itemMenu.appendChild(menuItem);
      Zotero.debug("CiteBridge: installed fallback item menu");
    }

    const collectionMenu = doc.getElementById("zotero-collectionmenu");
    if (collectionMenu && !doc.getElementById(this.collectionMenuItemID)) {
      const collectionSeparator = doc.createXULElement("menuseparator");
      collectionSeparator.id = this.collectionMenuSeparatorID;
      const collectionMenuItem = doc.createXULElement("menuitem");
      collectionMenuItem.id = this.collectionMenuItemID;
      collectionMenuItem.setAttribute("label", "同步分类到 VS Code");
      collectionMenuItem.addEventListener("command", async () => {
        await CiteBridgeContent.runSyncCollection();
      });
      const refreshCollectionState = () => {
        collectionMenuItem.hidden = !this.getSelectedCollection();
      };
      collectionMenu.addEventListener("popupshowing", refreshCollectionState);
      collectionMenuItem._citebridgeRefreshState = refreshCollectionState;
      collectionMenu.appendChild(collectionSeparator);
      collectionMenu.appendChild(collectionMenuItem);
      Zotero.debug("CiteBridge: installed fallback collection menu");
    }
  },

  async uninstallWindowMenu(win) {
    const doc = win.document;
    const itemMenu = doc.getElementById("zotero-itemmenu");
    const menuItem = doc.getElementById(this.menuItemID);
    if (itemMenu && menuItem?._citebridgeRefreshState) {
      itemMenu.removeEventListener("popupshowing", menuItem._citebridgeRefreshState);
    }
    doc.getElementById(this.menuItemID)?.remove();
    doc.getElementById(this.menuSeparatorID)?.remove();
    const collectionMenu = doc.getElementById("zotero-collectionmenu");
    const collectionMenuItem = doc.getElementById(this.collectionMenuItemID);
    if (collectionMenu && collectionMenuItem?._citebridgeRefreshState) {
      collectionMenu.removeEventListener("popupshowing", collectionMenuItem._citebridgeRefreshState);
    }
    collectionMenuItem?.remove();
    doc.getElementById(this.collectionMenuSeparatorID)?.remove();
  },

  getSelectedRegularItems() {
    try {
      const pane = Zotero.getActiveZoteroPane();
      return (pane?.getSelectedItems() || []).filter((item) => item?.isRegularItem?.());
    } catch {
      return [];
    }
  },

  getSelectedCollection() {
    try {
      return Zotero.getActiveZoteroPane()?.getSelectedCollection?.() || null;
    } catch {
      return null;
    }
  },

  async runSyncCollection(collection) {
    const selectedCollection = collection?.getChildItems ? collection : this.getSelectedCollection();
    if (!selectedCollection) {
      this.alert("CiteBridge", "Select a Zotero collection first.");
      return;
    }
    try {
      const items = await this.getCollectionItemsRecursive(selectedCollection);
      if (!items.length) {
        this.alert("CiteBridge", `No regular items were found in ${selectedCollection.name || "this collection"}.`);
        return;
      }
      await this.sendItems(items, `collection ${selectedCollection.name || "Untitled"}`);
    } catch (error) {
      const message = error?.stack || error?.message || String(error);
      Zotero.debug(`CiteBridge: collection sync failed: ${message}`);
      this.alert("Collection sync failed", message);
    }
  },

  async getCollectionItemsRecursive(rootCollection) {
    const collections = [rootCollection];
    const seenCollections = new Set();
    const items = new Map();

    while (collections.length) {
      const collection = collections.shift();
      if (!collection) continue;
      const collectionId = String(collection.id ?? collection.key ?? "");
      if (seenCollections.has(collectionId)) continue;
      seenCollections.add(collectionId);

      const childItems = await this.resolveItems(await Promise.resolve(collection.getChildItems(false, false)));
      for (const item of childItems) {
        if (!item?.isRegularItem?.()) continue;
        items.set(`${item.libraryID}:${item.key}`, item);
      }

      let childCollections = [];
      if (collection.getChildCollections) {
        childCollections = await Promise.resolve(collection.getChildCollections(false, false));
      } else if (Zotero.Collections?.getByParent) {
        childCollections = await Promise.resolve(Zotero.Collections.getByParent(collection.id));
      }
      for (const child of await this.resolveCollections(childCollections || [])) {
        collections.push(child);
      }
    }

    return Array.from(items.values());
  },

  async resolveItems(items) {
    if (!items?.length) return [];
    if (typeof items[0] === "number") return (await Zotero.Items.getAsync(items)).filter(Boolean);
    return items;
  },

  async resolveCollections(collections) {
    if (!collections?.length) return [];
    if (typeof collections[0] === "number") {
      const output = [];
      for (const id of collections) {
        const collection = await Zotero.Collections.getAsync(id);
        if (collection) output.push(collection);
      }
      return output;
    }
    return collections;
  },

  async runSendSelectedItems() {
    Zotero.debug("CiteBridge: menu command clicked");
    try {
      await this.sendSelectedItems(this.getSelectedRegularItems());
    } catch (error) {
      const message = error?.stack || error?.message || String(error);
      Zotero.debug(`CiteBridge: send failed: ${message}`);
      this.alert("Send failed", message);
    }
  },

  async sendSelectedItems(items) {
    Zotero.debug(`CiteBridge: sendSelectedItems with ${items?.length || 0} regular item(s)`);
    const regularItems = items.filter((item) => item.isRegularItem());
    if (!regularItems.length) {
      this.alert("CiteBridge", "No regular Zotero items were selected.");
      return;
    }

    await this.sendItems(regularItems, "selected items");
  },

  async sendItems(regularItems, sourceLabel) {
    const registry = await this.readRegistry();
    Zotero.debug(`CiteBridge: registry has ${registry.projects?.length || 0} project(s)`);
    const project = this.selectProject(registry);
    if (!project) {
      this.alert("CiteBridge", "No CiteBridge VS Code project was found. Initialize a project in VS Code first.");
      return;
    }
    Zotero.debug(`CiteBridge: selected project ${project.projectName} at ${project.rootPath}`);

    await IOUtils.makeDirectory(project.inboxDir, { ignoreExisting: true });
    const serialized = [];
    for (const item of regularItems) serialized.push(await this.serializeItem(item));

    const batchSize = 500;
    for (let offset = 0; offset < serialized.length; offset += batchSize) {
      const requestId = `${this.timestamp()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      const payload = {
        protocolVersion: 1,
        requestId,
        action: "importItems",
        source: "zotero",
        createdAt: new Date().toISOString(),
        targetProjectId: project.projectId,
        projectToken: project.projectToken,
        items: serialized.slice(offset, offset + batchSize)
      };
      const payloadPath = PathUtils.join(project.inboxDir, `${requestId}.json`);
      await IOUtils.writeUTF8(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);
      Zotero.debug(`CiteBridge: wrote payload ${payloadPath}`);
    }
    this.alert("CiteBridge", `Synced ${serialized.length} item(s) from ${sourceLabel} to ${project.projectName}.`);
  },

  async readRegistry() {
    const registryPath = PathUtils.join(this.getHomeDir(), ".citebridge", "projects.json");
    Zotero.debug(`CiteBridge: reading registry ${registryPath}`);
    try {
      return JSON.parse(await IOUtils.readUTF8(registryPath));
    } catch (error) {
      Zotero.debug(`CiteBridge: failed to read registry: ${error?.message || error}`);
      return { version: 1, projects: [] };
    }
  },

  getHomeDir() {
    try {
      return Services.dirsvc.get("Home", Components.interfaces.nsIFile).path;
    } catch {}
    try {
      return Services.env.get("USERPROFILE") || Services.env.get("HOME");
    } catch {}
    throw new Error("Could not determine the user home directory.");
  },

  selectProject(registry) {
    if (!registry.projects?.length) return null;
    const explicitActive = registry.projects.find((project) => project.projectId === registry.activeProjectId);
    if (explicitActive) return explicitActive;

    const active = registry.projects.find((project) => project.active);
    if (active) return active;

    const lastActive = registry.projects.find((project) => project.projectId === registry.lastActiveProjectId);
    return lastActive || registry.projects[0];
  },

  async serializeItem(item) {
    const date = item.getField("date") || "";
    const attachments = await this.serializeAttachments(item);
    return {
      libraryType: item.library.libraryType || "user",
      libraryId: String(item.libraryID || 0),
      itemKey: item.key,
      itemType: item.itemType,
      title: item.getField("title") || "",
      creators: item.getCreators().map((creator) => ({
        creatorType: creator.creatorType,
        firstName: creator.firstName,
        lastName: creator.lastName,
        name: creator.name
      })),
      year: (date.match(/\d{4}/) || [""])[0],
      date,
      doi: item.getField("DOI") || "",
      publicationTitle: item.getField("publicationTitle") || item.getField("conferenceName") || "",
      volume: item.getField("volume") || "",
      issue: item.getField("issue") || "",
      pages: item.getField("pages") || "",
      url: item.getField("url") || "",
      abstractNote: item.getField("abstractNote") || "",
      zoteroURI: Zotero.URI.getItemURI(item),
      attachments,
      bibtex: null,
      preferredCitationKey: item.getField("citationKey") || null
    };
  },

  async serializeAttachments(item) {
    const output = [];
    for (const attachmentID of item.getAttachments()) {
      const attachment = await Zotero.Items.getAsync(attachmentID);
      if (!attachment) continue;
      let filePath = "";
      try {
        filePath = await attachment.getFilePathAsync();
      } catch {
        filePath = "";
      }
      const filename = filePath ? PathUtils.filename(filePath) : "";
      const isPdf = attachment.attachmentContentType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
      if (isPdf && filePath) {
        output.push({
          type: "pdf",
          title: attachment.getField("title") || filename,
          path: filePath,
          filename
        });
      }
    }
    return output;
  },

  alert(title, message) {
    try {
      Services.prompt.alert(null, title, message);
    } catch {
      Zotero.alert(null, title, message);
    }
  },

  timestamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
};
