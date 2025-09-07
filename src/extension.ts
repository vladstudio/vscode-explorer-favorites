import * as vscode from 'vscode';
import * as path from 'path';

interface FavoriteItem {
  uri: string;
  type: 'file' | 'folder';
  order?: number;
}

class FavoritesProvider implements vscode.TreeDataProvider<FavoriteItem>, vscode.TreeDragAndDropController<FavoriteItem> {
  readonly dropMimeTypes = ['application/vnd.code.tree.favorites'];
  readonly dragMimeTypes = ['application/vnd.code.tree.favorites'];
  private _onDidChangeTreeData = new vscode.EventEmitter<FavoriteItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private favorites = new Set<string>();
  private items: FavoriteItem[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.loadFavorites();
  }

  private getWorkspaceKey(folderUri?: string): string {
    if (folderUri) {
      return `favorites_${folderUri}`;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder ? `favorites_${workspaceFolder.uri.fsPath}` : 'favorites_global';
  }

  private getRelevantWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.getWorkspaceFolder(uri) || vscode.workspace.workspaceFolders?.[0];
  }

  refresh() { this._onDidChangeTreeData.fire(undefined); }

  private loadFavorites() {
    this.items = [];
    this.favorites = new Set();

    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        const key = this.getWorkspaceKey(folder.uri.fsPath);
        const folderFavorites = this.context.globalState.get<FavoriteItem[]>(key, []);
        this.items.push(...folderFavorites);
        folderFavorites.forEach(f => this.favorites.add(f.uri));
      }
    } else {
      this.items = this.context.globalState.get<FavoriteItem[]>(this.getWorkspaceKey(), []);
      this.favorites = new Set(this.items.map(f => f.uri));
    }
  }

  private saveFavorites(folderPath: string, items: FavoriteItem[]) {
    const key = this.getWorkspaceKey(folderPath);
    this.context.globalState.update(key, items);
  }

  getTreeItem(element: FavoriteItem): vscode.TreeItem {
    const uri = vscode.Uri.parse(element.uri);
    const item = new vscode.TreeItem(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'favorite';
    item.command = { command: 'favorites.open', title: 'Open', arguments: [element] };
    item.resourceUri = uri;
    
    // Add relative path as description
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
      const parentDir = path.dirname(relativePath);
      if (parentDir && parentDir !== '.') {
        item.description = parentDir;
      }
    }
    
    return item;
  }

  getChildren(): FavoriteItem[] { 
    return this.items.sort((a, b) => (a.order || 0) - (b.order || 0)); 
  }

  add(uri: vscode.Uri, type: 'file' | 'folder') {
    const uriString = uri.toString();
    if (!this.favorites.has(uriString)) {
      const folder = this.getRelevantWorkspaceFolder(uri);
      const maxOrder = Math.max(0, ...this.items.map(i => i.order || 0));
      const newItem = { uri: uriString, type, order: maxOrder + 1 };
      
      if (folder) {
        const folderPath = folder.uri.fsPath;
        const key = this.getWorkspaceKey(folderPath);
        const folderItems = this.context.globalState.get<FavoriteItem[]>(key, []);
        folderItems.push(newItem);
        this.saveFavorites(folderPath, folderItems);
      }
      
      this.favorites.add(uriString);
      this.items.push(newItem);
      this.refresh();
    }
  }

  remove(item: FavoriteItem) {
    const uri = vscode.Uri.parse(item.uri);
    const folder = this.getRelevantWorkspaceFolder(uri);
    if (folder) {
      const folderPath = folder.uri.fsPath;
      const key = this.getWorkspaceKey(folderPath);
      const folderItems = this.context.globalState.get<FavoriteItem[]>(key, []);
      const updatedItems = folderItems.filter(f => f.uri !== item.uri);
      this.saveFavorites(folderPath, updatedItems);
    }
    
    this.favorites.delete(item.uri);
    this.items = this.items.filter(f => f.uri !== item.uri);
    this.refresh();
  }

  handleDrag(source: readonly FavoriteItem[], dataTransfer: vscode.DataTransfer): void {
    dataTransfer.set('application/vnd.code.tree.favorites', new vscode.DataTransferItem(source));
  }

  async handleDrop(target: FavoriteItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const transferItem = dataTransfer.get('application/vnd.code.tree.favorites');
    if (!transferItem) return;

    const source = transferItem.value as FavoriteItem[];
    if (!source.length) return;

    const targetIndex = target ? this.items.findIndex(i => i.uri === target.uri) : this.items.length;
    const sourceItem = source[0];
    const sourceIndex = this.items.findIndex(i => i.uri === sourceItem.uri);

    if (sourceIndex === -1 || sourceIndex === targetIndex) return;

    this.items.splice(sourceIndex, 1);
    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    this.items.splice(insertIndex, 0, sourceItem);

    this.items.forEach((item, index) => item.order = index);

    const workspaceItems = new Map<string, FavoriteItem[]>();
    for (const item of this.items) {
      const uri = vscode.Uri.parse(item.uri);
      const folder = this.getRelevantWorkspaceFolder(uri);
      const key = folder ? folder.uri.fsPath : 'global';
      if (!workspaceItems.has(key)) workspaceItems.set(key, []);
      workspaceItems.get(key)!.push(item);
    }

    for (const [folderPath, items] of workspaceItems) {
      this.saveFavorites(folderPath, items);
    }

    this.refresh();
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new FavoritesProvider(context);
  vscode.window.createTreeView('favorites', { treeDataProvider: provider, dragAndDropController: provider });

  context.subscriptions.push(
    vscode.commands.registerCommand('favorites.add', async (uri: vscode.Uri) => {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        const type = stat.type & vscode.FileType.Directory ? 'folder' : 'file';
        provider.add(uri, type);
      } catch {}
    }),

    vscode.commands.registerCommand('favorites.remove', (item: FavoriteItem) => {
      provider.remove(item);
    }),

    vscode.commands.registerCommand('favorites.open', async (item: FavoriteItem) => {
      try {
        const uri = vscode.Uri.parse(item.uri);
        if (item.type === 'file') {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        } else {
          await vscode.commands.executeCommand('revealInExplorer', uri);
          await vscode.commands.executeCommand('list.expand');
        }
      } catch {}
    })
  );
}