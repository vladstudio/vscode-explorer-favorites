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

  refresh() { this._onDidChangeTreeData.fire(undefined); }

  private loadFavorites() {
    this.items = this.context.globalState.get<FavoriteItem[]>('favorites', []);
    this.favorites = new Set(this.items.map(f => f.uri));
  }

  private saveFavorites() {
    this.context.globalState.update('favorites', this.items);
  }

  getTreeItem(element: FavoriteItem): vscode.TreeItem {
    const uri = vscode.Uri.parse(element.uri);
    const item = new vscode.TreeItem(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = uri;
    item.contextValue = 'favorite';
    item.command = { command: 'favorites.open', title: 'Open', arguments: [element] };
    return item;
  }

  getChildren(): FavoriteItem[] { return this.items; }

  add(uri: vscode.Uri, type: 'file' | 'folder') {
    const uriString = uri.toString();
    if (!this.favorites.has(uriString)) {
      this.favorites.add(uriString);
      this.items.push({ uri: uriString, type });
      this.saveFavorites();
      this.refresh();
    }
  }

  remove(item: FavoriteItem) {
    this.favorites.delete(item.uri);
    this.items = this.items.filter(f => f.uri !== item.uri);
    this.saveFavorites();
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