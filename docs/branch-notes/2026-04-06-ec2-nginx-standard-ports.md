# 2026-04-06 - ec2 nginx standard ports

## Summary
- Updated Docker Compose nginx host port publishing to expose both standard and compatibility bindings: `80:80`, `443:443`, `8080:80`, and `8443:443`.
- Updated nginx port `80` behavior to proxy both frontend (`/`) and API (`/api/`) directly rather than forcing an HTTP-to-HTTPS redirect.
- Kept TLS listener behavior on `443` with the existing repo certificate mount path `./.ssl -> /etc/nginx/certs`.

## What Did Not Work
- Forcing all HTTP traffic to HTTPS during startup made access appear down when TLS trust/certificate hostname mismatches were still being resolved on EC2.
