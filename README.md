# Hypercall

Hypercall is a small self-hosted chat app. It supports username/password accounts, editable display names, friend requests, persistent direct and group messages, profile pictures, peer-to-peer voice/video calling, and play-credit mini-games.

## Run on your PC

Install Node.js 22.13 or newer, open PowerShell in this folder, and run:

```powershell
npm.cmd install
npm.cmd start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173) on the host PC. Accounts, friend requests, direct and group messages, and profile pictures are stored in `data\hypergamy.sqlite`.

Create a group from the **Group chats** section in the sidebar. Choose a name and at least one existing friend. Group chat messages are saved and shared with every member. In **Settings**, choose a JPEG, PNG, or WebP profile picture from your device; Hypercall crops and resizes it before saving a JPEG copy shared with your friends and group members.

The **Games** section includes Crash, Blackjack, Mines, and Coin Flip, plus play-credit transfers and friend coin-flip challenges. Each account starts with 10,000 virtual credits; game balances and active rounds are saved on the server. These credits have no cash value and cannot be purchased, withdrawn, or exchanged for real money.

The **Hypercall Shop** lets players spend those virtual credits on account-persistent color themes and visual effects. Coin Flip shows the toss animation, Crash includes a rising rocket, and losses display a brief game-specific effect.

## Share a temporary join link

For people outside your Wi-Fi to join, keep the app running on your PC and start a Cloudflare Quick Tunnel in another terminal:

```powershell
cloudflared tunnel --url http://127.0.0.1:4173
```

Share the `https://...trycloudflare.com` link printed by the tunnel. Anyone who receives that link can create an account. The temporary link works only while both the app and tunnel are running, and it changes when a new tunnel starts. Stop the tunnel with Ctrl+C to take the link offline. Do not share it publicly unless you want anyone who finds it to be able to register.

Quick Tunnels are for testing, not guaranteed long-term hosting. A PC-hosted app also depends on the PC staying on and connected to the internet. Cloudflare relays the public connection; calls attempt direct peer-to-peer WebRTC using public STUN servers. Calls start with audio when a requested camera is unavailable, and the camera can be turned on or off during a call. Some networks block peer-to-peer media; this prototype does not include a TURN relay, so a call may fail on restrictive networks.

## Deploy on an always-on server

The Docker Compose setup runs Hypercall on a Linux server, keeps its SQLite database in a persistent `data` directory, and uses Caddy to provide HTTPS. A free Linux VM can stay online while your PC is off, subject to the provider's free-tier limits and availability. GitHub stores the application code; it does not run the server by itself.

1. Create a Linux VM with a public IPv4 address and install Docker Engine with the Compose plugin. Allow inbound TCP ports 22, 80, and 443 in the VM firewall and provider network rules.
2. Register a free DNS hostname, such as a DuckDNS subdomain, and point it to the VM's public IPv4 address. Caddy uses this hostname to request and renew an HTTPS certificate.
3. On the VM, create `/opt/hypercall`, copy `.env.example` to `.env`, set `HYPERCALL_DOMAIN` to your DNS hostname, and create `/opt/hypercall/data`. The deploy account must be able to write to `/opt/hypercall` and run Docker Compose without an interactive password prompt.
4. Create an SSH key pair for GitHub Actions. Add the public key to the VM user's `~/.ssh/authorized_keys`. In the private GitHub repository, add Actions secrets named `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS`. `DEPLOY_KNOWN_HOSTS` must contain the VM's verified SSH host key; do not disable SSH host-key checking.
5. Push the `main` branch. The workflow uploads the code and runs `docker compose up -d --build`. It excludes `.env` and `data`, so later deployments preserve both the server configuration and chat database.

To migrate existing local accounts and chats, first deploy the app and confirm the HTTPS hostname works. Then stop the local Hypercall server, make a backup of `data\hypergamy.sqlite`, and securely copy that database to `/opt/hypercall/data/hypergamy.sqlite` on the VM. Restart the app container after the copy. Never commit or upload the database to GitHub; it contains private account and chat data.

The provided deploy workflow does not provision a VM or DNS account. Free compute availability, sleeping, resource limits, and terms vary by provider; a free DNS hostname is not a custom registered domain. Back up `/opt/hypercall/data` regularly.

## Security and privacy

Password keys are hashed on the server with scrypt and a random salt. Login sessions use HttpOnly cookies. Database files stay on the host PC and are not uploaded to GitHub by this app. Anyone with access to the PC can access its database files. This is a personal prototype, not a professionally audited service; avoid sensitive information and back up the `data` folder if you want to keep chat history.
