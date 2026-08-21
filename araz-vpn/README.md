# Araz VPN

A lightweight WireGuard-based VPN project for personal use.

## Important
GitHub Pages can host the interface, but it cannot act as the VPN server. A real VPN needs a reachable server with a public IP.

This folder contains:
- `install-wireguard.sh` — installs and configures a WireGuard server on Ubuntu/Debian.
- `wg0-server.conf.example` — server configuration template.
- `index.html` — simple Araz VPN landing/connection page.

## Fast connection design
WireGuard is used because it has low connection overhead and is designed for quick handshakes. The actual connection speed depends mainly on the VPN server location, network quality, and routing.

## Security
Do not put a private WireGuard key, server private key, or real client configuration containing private keys into a public GitHub repository.
