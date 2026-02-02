#!/bin/bash
set -x  # Show each command as it runs
set -e  # Exit on any error

echo "=== Installing Claude CLI ==="
echo "Current user: $(whoami)"
echo "Home directory: $HOME"
echo "Current PATH: $PATH"

echo -e "\n=== Running Claude installation ==="
curl -fsSL https://claude.ai/install.sh | bash

echo -e "\n=== Checking installation ==="
ls -la ~/.local/bin/ || echo "~/.local/bin does not exist"

echo -e "\n=== Adding to PATH ==="
echo "export PATH=\$HOME/.local/bin:\$PATH" >> ~/.zshrc
echo "export PATH=\$HOME/.local/bin:\$PATH" >> ~/.bashrc

echo -e "\n=== Verifying ==="
export PATH="$HOME/.local/bin:$PATH"
which claude || echo "Claude not found in PATH"
claude --version || echo "Could not run claude"

echo -e "\n=== Installation complete ==="
