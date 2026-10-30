FROM node:20-bookworm

# Tools the agents use, what init-firewall.sh needs (iptables, ipset, dig, jq), and what
# Claude Code's own Bash sandbox needs on Linux (bubblewrap, socat).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git gh jq sudo iptables ipset iproute2 dnsutils ca-certificates curl bubblewrap socat \
  && rm -rf /var/lib/apt/lists/*

# gitleaks for .githooks/pre-commit, which fails closed without it. Pinned and checksum-verified;
# Debian's package is too old for the `gitleaks git` subcommand.
ARG GITLEAKS_VERSION=8.30.1
RUN set -eu; \
  case "$(dpkg --print-architecture)" in \
    amd64) arch=x64; sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;; \
    arm64) arch=arm64; sha=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080 ;; \
    *) echo "unsupported architecture" >&2; exit 1 ;; \
  esac; \
  tarball="gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz"; \
  curl -fsSLo "/tmp/$tarball" "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/$tarball"; \
  echo "$sha  /tmp/$tarball" | sha256sum -c -; \
  tar -xzf "/tmp/$tarball" -C /usr/local/bin gitleaks; \
  rm "/tmp/$tarball"

# pnpm from the version pinned in package.json's packageManager field.
RUN corepack enable

# Claude Code, pinned. Bump deliberately, in its own PR. No package's lifecycle scripts run during
# the install; only Claude Code's own postinstall then runs, which links its native binary.
RUN npm install -g --ignore-scripts @anthropic-ai/claude-code@2.1.312 \
  && node "$(npm root -g)/@anthropic-ai/claude-code/install.cjs"

# Managed settings win over user and project settings and an agent can't edit them: the
# Bash sandbox is on (with its own domain allowlist) and bypass-permissions mode is off.
COPY managed-settings.json /etc/claude-code/managed-settings.json

# The node user may run the firewall script as root, and nothing else.
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod 0755 /usr/local/bin/init-firewall.sh \
  && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall \
  && chmod 0440 /etc/sudoers.d/node-firewall

USER node
