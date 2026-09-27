"""
Create the self-signed TLS pair used by start-mobile-https.bat.

The PWA can only be installed (and its service worker only registers) on a
"secure origin" — HTTPS or localhost. A phone reaching the PC over Wi-Fi is
neither, so this script makes an HTTPS option available for LAN testing.

It needs the `openssl` binary (Git for Windows ships one). Chrome/Android still
show a certificate warning for a self-signed cert: tap "Advanced" → "Proceed",
and some browsers will keep the install prompt hidden anyway. For a certificate
your phone trusts without warnings, use a tunnel (cloudflared/ngrok) or deploy
the built `dist/` to a real HTTPS host.

Run:  python frontend-react/scripts/make_dev_cert.py
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CERT_DIR = os.path.normpath(os.path.join(HERE, "..", "certs"))
KEY_PATH = os.path.join(CERT_DIR, "dev-key.pem")
CERT_PATH = os.path.join(CERT_DIR, "dev-cert.pem")
CONFIG_PATH = os.path.join(CERT_DIR, "openssl.cnf")
HOSTS_PATH = os.path.join(CERT_DIR, "hosts.txt")

OPENSSL_CANDIDATES = (
    r"C:\Program Files\Git\usr\bin\openssl.exe",
    r"C:\Program Files (x86)\Git\usr\bin\openssl.exe",
    r"C:\msys64\ucrt64\bin\openssl.exe",
    r"C:\msys64\mingw64\bin\openssl.exe",
)


def find_openssl() -> str | None:
    found = shutil.which("openssl")
    if found:
        return found
    for candidate in OPENSSL_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    return None


def lan_ip() -> str:
    """Best-effort local address of the interface that reaches the internet."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def local_ipv4_addresses() -> list[str]:
    """Every non-loopback IPv4 of this machine, so all NICs end up in the SAN."""
    addresses: set[str] = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    addresses.add(lan_ip())
    return sorted(ip for ip in addresses if not ip.startswith("127."))


def build_hosts() -> list[str]:
    hosts = ["localhost", "127.0.0.1", *local_ipv4_addresses()]
    return list(dict.fromkeys(hosts))


def write_config(hosts: list[str]) -> None:
    """OpenSSL config: keyed SAN entries are only valid inside a named section."""
    dns = [host for host in hosts if not _is_ip(host)]
    ips = [host for host in hosts if _is_ip(host)]
    lines = [
        "[req]",
        "default_bits = 2048",
        "prompt = no",
        "distinguished_name = dn",
        "x509_extensions = v3_ext",
        "",
        "[dn]",
        "CN = FastWork Mobile Dev",
        "O = FastWork Mobile",
        "",
        "[v3_ext]",
        # CA:TRUE on the leaf is what mkcert does as well; it makes Android a bit
        # more willing to accept the certificate after it is trusted once.
        "basicConstraints = critical, CA:TRUE",
        "keyUsage = critical, digitalSignature, keyCertSign",
        "extendedKeyUsage = serverAuth",
        "subjectKeyIdentifier = hash",
        "subjectAltName = @alt_names",
        "",
        "[alt_names]",
    ]
    lines += [f"DNS.{index + 1} = {name}" for index, name in enumerate(dns)]
    lines += [f"IP.{index + 1} = {addr}" for index, addr in enumerate(ips)]
    lines.append("")
    with open(CONFIG_PATH, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def _is_ip(value: str) -> bool:
    try:
        socket.inet_pton(socket.AF_INET, value)
        return True
    except OSError:
        return False


def already_valid(hosts: list[str]) -> bool:
    if not (os.path.isfile(KEY_PATH) and os.path.isfile(CERT_PATH)):
        return False
    if not os.path.isfile(HOSTS_PATH):
        return False
    with open(HOSTS_PATH, encoding="utf-8") as handle:
        return handle.read().split() == hosts


def main() -> int:
    openssl = find_openssl()
    if not openssl:
        print("[X] openssl tidak ditemukan. Install Git for Windows (menyertakan openssl) "
              "atau pakai start-mobile.bat tanpa HTTPS.")
        return 1

    hosts = build_hosts()
    if already_valid(hosts):
        print(f"[i] Sertifikat masih valid untuk: {', '.join(hosts)}")
        return 0

    os.makedirs(CERT_DIR, exist_ok=True)
    write_config(hosts)

    command = [
        openssl, "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "825", "-nodes",
        "-config", CONFIG_PATH,
        "-keyout", KEY_PATH,
        "-out", CERT_PATH,
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print("[X] openssl gagal membuat sertifikat:")
        print(result.stderr.strip() or result.stdout.strip())
        return 1

    with open(HOSTS_PATH, "w", encoding="utf-8") as handle:
        handle.write(" ".join(hosts))

    print(f"[OK] Sertifikat dibuat di {CERT_DIR}")
    print(f"     Berlaku untuk: {', '.join(hosts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
