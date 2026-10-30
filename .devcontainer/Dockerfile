FROM node:20-bookworm

# Tools the agents use, what init-firewall.sh needs (iptables, ipset, dig, jq), and what
# Claude Code's own Bash sandbox needs on Linux (bubblewrap, socat).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git gh jq sudo iptables ipset iproute2 dnsutils ca-certificates curl bubblewrap socat \
  && rm -rf /var/lib/apt/lists/*

# pnpm from the version pinned in package.json's packageManager field.
RUN corepack enable

# Claude Code, pinned. Bump deliberately, in its own PR.
RUN npm install -g @anthropic-ai/claude-code@2.1.312

# Managed settings win over user and project settings and an agent can't edit them: the
# Bash sandbox is on (with its own domain allowlist) and bypass-permissions mode is off.
COPY managed-settings.json /etc/claude-code/managed-settings.json

# The node user may run the firewall script as root, and nothing else.
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod 0755 /usr/local/bin/init-firewall.sh \
  && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall \
  && chmod 0440 /etc/sudoers.d/node-firewall

USER node
