# Local SearXNG

This is the canonical SearXNG runtime used by both pi web-search extensions.

- Endpoint: `http://localhost:8888`
- Compose file: `docker-compose.yml`
- Runtime configuration: `settings.yml`
- Local secrets/overrides: `.env` (not committed)

Manage it with `/mnt/d/Linux/searxng-manage.sh up|down|restart|status|logs`.

The script must stay on that WSL path: the pi-websearch package invokes it through
`bash.exe`, which cannot resolve Windows-style paths.
