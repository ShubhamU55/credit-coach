#!/usr/bin/env bash
# Egress allowlist for the agent sandbox. Default policy is DROP; only DNS, loopback, the
# host network and the hosts below are reachable. Re-run on every container start.
set -euo pipefail
IFS=$'\n\t'

ALLOWED_DOMAINS=(
  api.anthropic.com      # Claude Code
  statsig.anthropic.com  # Claude Code
  claude.ai              # Claude Code sign-in
  registry.npmjs.org     # pnpm install
  docs.expo.dev          # apps/mobile/AGENTS.md: read the versioned Expo docs
)

iptables -F
iptables -X
ipset destroy allowed-hosts 2>/dev/null || true

# DNS and loopback first, so the lookups below work.
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-hosts hash:net

# GitHub publishes its address ranges; fetch them before the default policy turns to DROP.
gh_ranges=$(curl -fsS https://api.github.com/meta)
echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null || {
  echo "init-firewall: could not read GitHub's address ranges" >&2
  exit 1
}
while read -r cidr; do
  [[ "$cidr" == *:* ]] && continue # IPv4 only; IPv6 egress is dropped below
  ipset add allowed-hosts "$cidr" -exist
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | sort -u)

for domain in "${ALLOWED_DOMAINS[@]}"; do
  ips=$(dig +short A "$domain" | grep -E '^[0-9.]+$' || true)
  if [[ -z "$ips" ]]; then
    echo "init-firewall: could not resolve $domain" >&2
    exit 1
  fi
  while read -r ip; do ipset add allowed-hosts "$ip" -exist; done <<<"$ips"
done

# The host network (VS Code's server and port forwarding).
host_net=$(ip route | awk '/default/ {print $3}' | sed 's/\.[0-9]*$/.0\/24/')
iptables -A INPUT -s "$host_net" -j ACCEPT
iptables -A OUTPUT -d "$host_net" -j ACCEPT

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
ip6tables -P OUTPUT DROP 2>/dev/null || true

iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-hosts dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

# Prove it: an unlisted host must fail, an allowed one must work.
if curl -fsS --max-time 5 https://example.com >/dev/null 2>&1; then
  echo "init-firewall: example.com is reachable; the allowlist is not enforced" >&2
  exit 1
fi
curl -fsS --max-time 5 https://api.github.com/zen >/dev/null || {
  echo "init-firewall: api.github.com is blocked; the allowlist is too tight" >&2
  exit 1
}
echo "init-firewall: egress limited to the allowlist"
