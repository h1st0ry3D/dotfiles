# Shared functions for bash + zsh.
# Sourced from ~/.bashrc and ~/.zshrc.
# Keep this file portable: no bash-only or zsh-only builtins/options.

# Kill whatever is listening on a port
k() {
    kill-the-port "$@"
}

# Open superfile and cd into the last visited directory
y() {
    os=$(uname -s)

    # Linux
    if [[ "$os" == "Linux" ]]; then
        export SPF_LAST_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/superfile/lastdir"
    fi

    # macOS
    if [[ "$os" == "Darwin" ]]; then
        export SPF_LAST_DIR="$HOME/Library/Application Support/superfile/lastdir"
    fi

    command spf "$@"

    [ ! -f "$SPF_LAST_DIR" ] || {
        . "$SPF_LAST_DIR"
        rm -f -- "$SPF_LAST_DIR" >/dev/null
    }
}

# Start ssh with tmux session
s() {
    local tmux="/home/linuxbrew/.linuxbrew/bin/tmux"
    local session="${TMUX_SESSION:-main}"

    ssh -t "${SSH_USER}@${SSH_HOST}" \
        "export LANG=en_US.UTF-8; \
         exec ${tmux} new-session -A -s '${session}'"
}

# Run bun scripts
run() {
    local script
    script=$(jq -r '.scripts | keys[]' package.json |
        fzf --prompt="Select script: " --layout=reverse-list)
    [[ -n "$script" ]] && bun run "$script"
}

# Run npm scripts
nrun() {
    local script
    script=$(jq -r '.scripts | keys[]' package.json |
        fzf --prompt="Select script: " --layout=reverse-list)
    [[ -n "$script" ]] && npm run "$script"
}

# Run pnpm scripts
prun() {
    local script
    script=$(jq -r '.scripts | keys[]' package.json |
        fzf --prompt="Select script: " --layout=reverse-list)
    [[ -n "$script" ]] && pnpm run "$script"
}
