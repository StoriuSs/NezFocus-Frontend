# Preparing a server

Everything on the machine that isn't the app itself: keeping it patched, making
brute-force attempts pointless, and leaving enough headroom for a build. Half
of it is already true on a fresh Ubuntu server; this page says which half, so
you only do the rest.

It assumes one server running this starter with `deploy.sh`
([deploy.md](./deploy.md)). Ubuntu is assumed; other distributions have the
same tools under the same names. If the API runs on the same machine, its
starter has the same page with the extra pieces a database needs.

- [What the starter already does](#what-the-starter-already-does)
- [Security updates](#security-updates)
- [fail2ban: ban repeated failed logins](#fail2ban-ban-repeated-failed-logins)
- [Swap: room to breathe](#swap-room-to-breathe)
- [SSH](#ssh)
- [The firewall](#the-firewall)
- [Disk](#disk)
- [The clock](#the-clock)
- [A checklist](#a-checklist)

---

## What the starter already does

| Already handled | Where |
|---|---|
| The app's container is reachable **only from the machine itself**; the host's nginx is what faces the internet | `docker-compose.prod.yaml` binds it to `127.0.0.1` |
| Container logs can't fill the disk | the `logging:` block caps their size |
| Old release images are removed | `deploy.sh` keeps the last few and prunes the rest |
| TLS, and its renewal | `nginx/bootstrap-nginx.sh` sets up certbot's timer |
| A release that doesn't serve is not promoted | the healthcheck, and `deploy.sh`'s rollback |
| nginx runs as a non-root user inside the image, and sends the security headers | `Dockerfile`, `nginx/security-headers.conf` |

What follows is what the server itself needs.

---

## Security updates

A server that is never updated is the most common way a small site is taken
over: a hole is published, and machines that never applied the fix are found by
scanning.

**Ubuntu already does this.** `unattended-upgrades` is installed and enabled on
Ubuntu Server images, including AWS's, and applies **security** updates by
itself. Check:

```bash
systemctl is-active unattended-upgrades      # active
cat /etc/apt/apt.conf.d/20auto-upgrades      # both lines "1"
```

If it isn't there: `sudo apt install unattended-upgrades` and
`sudo dpkg-reconfigure --priority=low unattended-upgrades`.

**What it does not do:** reboot. A kernel update is installed, but the machine
keeps running the old one until it restarts. `ls /var/run/reboot-required` says
whether one is waiting. Either reboot when it suits you (`sudo reboot`; the
container comes back by itself) or let it happen automatically, in
`/etc/apt/apt.conf.d/50unattended-upgrades`:

```
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
```

---

## fail2ban: ban repeated failed logins

**What it is:** a small service that watches the log of a service — SSH here —
and, when the same address fails to log in several times in a row, tells the
firewall to drop that address for a while. It doesn't decide who may log in; it
only stops the same machine from trying thousands of times.

**Why you want it even with keys only.** Password login is off on this server,
so the attempts can never succeed — but they never stop, either. With port 22
open to the internet (which the Deploy button needs, see
[deploy.md](./deploy.md)) a fresh server sees thousands of them a day.

```bash
sudo apt install -y fail2ban
```

Then one file of your own, so a package update never overwrites your settings:

```bash
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'CONF'
[sshd]
enabled = true
# Ubuntu's ssh logs go to systemd's journal, not to a file.
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
CONF
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
```

Five failures within ten minutes, and the address is dropped for an hour.

**Check it:**

```bash
sudo fail2ban-client status sshd
```

**Try it without locking yourself out** — ban a documentation address, then
release it:

```bash
sudo fail2ban-client set sshd banip 203.0.113.5
sudo fail2ban-client get sshd banned        # ['203.0.113.5']
sudo fail2ban-client set sshd unbanip 203.0.113.5
```

**If you ban yourself**, you are locked out for `bantime`. Ways back in: your
provider's serial or browser console, another machine, or waiting. Then
`sudo fail2ban-client set sshd unbanip <your address>`.

**Web traffic.** fail2ban can also watch nginx's logs, but this app is static
files: there is no login to brute-force here, and an nginx jail mainly risks
banning a whole office behind one address.

---

## Swap: room to breathe

**What it is:** disk the kernel may use when memory runs out. Much slower than
memory, so it is not extra capacity — it is the difference between "slow for a
moment" and "the kernel kills something".

Serving static files needs very little memory, but **building the image on the
server** (`DEPLOY_IMAGE_SOURCE=build`) needs a lot for a short while, and that
is where a 1–2 GB machine falls over. 2 GB of swap costs 2 GB of disk:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab     # survives a reboot
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl -w vm.swappiness=10
```

`swappiness=10` means "use memory; take swap only when you must". Check with
`free -m`. If swap is in constant use, the machine is too small. (Letting CI
build the image instead removes the spike entirely — see
[deploy.md](./deploy.md), "registry".)

---

## SSH

On Ubuntu's cloud images this is already right, and the thing to do is **not
break it**:

```bash
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'
```

```
permitrootlogin prohibit-password
pubkeyauthentication yes
passwordauthentication no
```

- **`passwordauthentication no`** is what makes the endless login attempts
  harmless. Never turn it on to "just quickly" do something.
- **One key per purpose**, so you can withdraw one without touching the others:
  yours, and the Deploy button's ([deploy.md](./deploy.md)). Each is a line in
  `~/.ssh/authorized_keys`; delete the line to withdraw it.
- **Changing the port** removes most of the noise, because scans look at 22. It
  is not security, and every tool has to know the new port.

---

## The firewall

Two layers, and you only need one of them to be right:

- **Your provider's**, outside the machine: AWS security groups, DigitalOcean's
  firewall, Hetzner's. This is the one to use — a mistake inside the machine
  can't lock traffic out of it.
- **The machine's** (`ufw`): useful when your provider has no firewall.
  `sudo ufw allow 22,80,443/tcp && sudo ufw enable`. Enabling it without
  allowing 22 first ends your session.

Only three ports need to be reachable: **22** (SSH), **80** (HTTP, which
Let's Encrypt needs even if you redirect it away) and **443** (HTTPS). The
app's own port (8081 by default) is bound to `127.0.0.1` and cannot be reached
from outside, whatever the firewall says.

---

## Disk

Images and logs are what fill a small disk, and both are handled: `deploy.sh`
prunes old release images, and the container's logs are capped.

```bash
df -h /                    # how full
docker system df           # what Docker holds
docker system prune -a     # careful: removes every image no container uses,
                           # including the previous release you might roll back to
```

---

## The clock

A wrong clock breaks TLS certificates and token expiry. `systemd-timesyncd` is
enabled by default on Ubuntu; `timedatectl` should say
`System clock synchronized: yes`.

---

## A checklist

For a new server, in this order:

- [ ] Only ports 22, 80 and 443 reachable, in the provider's firewall
- [ ] `sudo sshd -T | grep passwordauthentication` says `no`
- [ ] `systemctl is-active unattended-upgrades` says `active`
- [ ] fail2ban installed, `fail2ban-client status sshd` shows the jail
- [ ] Swap on, `swappiness` 10 (especially if the server builds the image)
- [ ] `timedatectl` says the clock is synchronised
- [ ] Docker and the compose plugin installed ([deploy.md](./deploy.md))
- [ ] nginx and certbot set up (`nginx/bootstrap-nginx.sh`)
- [ ] `.env.production` filled in, with the one required setting, `VITE_API_URL`
- [ ] An uptime check from outside, so you hear about it before your users do
