#!/bin/bash
set -e
npm run compile
vsce package --no-dependencies
code --install-extension *.vsix --force
rm -f *.vsix
echo "Installed. Reload VS Code window to activate."
