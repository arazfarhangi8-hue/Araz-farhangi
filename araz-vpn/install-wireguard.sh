#!/usr/bin/env bash
set -euo pipefail

# Araz VPN - WireGuard server bootstrap for Ubuntu/Debian.
# Run as root on a real VPS/server with a public IPv4 address.

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard iptables qrencode

umask 077
mkdir -p /etc/wireguard

SERVER_IF="$(ip route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i==\"dev\"){print $(i+1); exit}}')"
SERVER_PRIV="$(wg genkey)"
SERVER_PUB="$(printf '%s' "$SERVER_PRIV" | wg pubkey)"

cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.77.0.1/24
ListenPort = 51820
PrivateKey = ${SERVER_PRIV}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ${SERVER_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ${SERVER_IF} -j MASQUERADE
EOF

cat > /etc/sysctl.d/99-araz-vpn.conf <<EOF
net.ipv4.ip_forward=1
EOF
sysctl --system >/dev/null

systemctl enable --now wg-quick@wg0

cat <<EOF
Araz VPN server is installed.
Server public key:
${SERVER_PUB}

Public server IPv4:
$(curl -4 -s https://api.ipify.org || true)

Next: create a client peer and keep its private key secret. Do not upload real private keys to GitHub.
EOF
