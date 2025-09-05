import * as vscode from 'vscode';
import * as path from 'path';

interface FavoriteItem {
  uri: vscode.Uri;
  type: 'file' | 'folder';
}

class FavoritesProvider implements vscode.TreeDataProvider<FavoriteItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FavoriteItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private favorites: FavoriteItem[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.loadFavorites();
  }

  refresh() { this._onDidChangeTreeData.fire(undefined); }

  private loadFavorites() {
    const saved = this.context.globalState.get<FavoriteItem[]>('favorites', []);
    this.favorites = saved;
  }

  private saveFavorites() {
    this.context.globalState.update('favorites', this.favorites);
  }

  getTreeItem(element: FavoriteItem): vscode.TreeItem {
    const item = new vscode.TreeItem(path.basename(element.uri.fsPath), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = element.uri;
    item.contextValue = 'favorite';
    item.command = { command: 'favorites.open', title: 'Open', arguments: [element] };
    return item;
  }

  getChildren(): FavoriteItem[] { return this.favorites; }

  add(uri: vscode.Uri, type: 'file' | 'folder') {
    if (!this.favorites.find(f => f.uri.fsPath === uri.fsPath)) {
      this.favorites.push({ uri, type });
      this.saveFavorites();
      this.refresh();
    }
  }

  remove(item: FavoriteItem) {
    this.favorites = this.favorites.filter(f => f.uri.fsPath !== item.uri.fsPath);
    this.saveFavorites();
    this.refresh();
  }
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new FavoritesProvider(context);
  vscode.window.registerTreeDataProvider('favorites', provider);

  context.subscriptions.push(
    vscode.commands.registerCommand('favorites.add', async (uri: vscode.Uri) => {
      const stat = await vscode.workspace.fs.stat(uri);
      provider.add(uri, stat.type === vscode.FileType.Directory ? 'folder' : 'file');
    }),

    vscode.commands.registerCommand('favorites.remove', (item: FavoriteItem) => {
      provider.remove(item);
    }),

    vscode.commands.registerCommand('favorites.open', async (item: FavoriteItem) => {
      if (item.type === 'file') {
        const doc = await vscode.workspace.openTextDocument(item.uri);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('revealInExplorer', item.uri);
      } else {
        await vscode.commands.executeCommand('revealInExplorer', item.uri);
      }
    })
  );
}