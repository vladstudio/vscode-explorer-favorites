import * as vscode from 'vscode';
import * as path from 'path';

interface FavoriteItem {
  uri: string;
  type: 'file' | 'folder';
}

class FavoritesProvider implements vscode.TreeDataProvider<FavoriteItem> {
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
    item.resourceUri = uri;
    item.contextValue = 'favorite';
    item.command = { command: 'favorites.open', title: 'Open', arguments: [element] };
    
    
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

  getChildren(): FavoriteItem[] { return this.items; }

  add(uri: vscode.Uri, type: 'file' | 'folder') {
    const uriString = uri.toString();
    if (!this.favorites.has(uriString)) {
      const folder = this.getRelevantWorkspaceFolder(uri);
      if (folder) {
        const folderPath = folder.uri.fsPath;
        const key = this.getWorkspaceKey(folderPath);
        const folderItems = this.context.globalState.get<FavoriteItem[]>(key, []);
        folderItems.push({ uri: uriString, type });
        this.saveFavorites(folderPath, folderItems);
      }
      
      this.favorites.add(uriString);
      this.items.push({ uri: uriString, type });
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
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new FavoritesProvider(context);
  vscode.window.registerTreeDataProvider('favorites', provider);

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