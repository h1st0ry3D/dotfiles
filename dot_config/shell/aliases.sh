# Shared aliases for bash + zsh.
# Sourced from ~/.bashrc and ~/.zshrc.
# Keep this file portable: aliases only, no bindkey/compinit/shell options.

# cd path aliases
alias a="cd $HOME/agent"
alias g="cd $HOME/Git"
alias u="cd $HOME"
alias dot="cd $HOME/.config"

# tool aliases
alias c="chezmoi"
alias d="hunk diff --watch"
alias f="fresh"
alias j="just"
alias l="lazygit"
alias h="herdr"
alias m="hyprmon"
alias o="opencode -c"
alias p="pi -c"
alias dev="devpod"

# biome alias
alias b="biome check --write ."
alias B="biome format --write ."
alias bl="biome lint --write ."

# list alias
alias ls="ls -1aF --color=auto"
