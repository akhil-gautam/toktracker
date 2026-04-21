# Tokscale

Proactive insights for AI coding assistants — Claude Code, Codex, Gemini CLI,
and OpenCode. Tokscale watches your token spend in real time and flags
anti-patterns (retry loops, context bloat, correction storms) while they're
happening, so you can course-correct before waste compounds.

Two surfaces, one data model:

- **`tokscale` CLI** — terminal UI, daemon, git/PR attribution, detection rules.
- **Tokscale.app** — macOS menubar + full dashboard with the same features.

## Install

### CLI — Homebrew (recommended)

```bash
brew tap akhil-gautam/tap
brew install tokscale
```

### CLI — npm

```bash
npm install -g tokscale
```

Requires Node 20+.

### CLI — from GitHub source

```bash
git clone https://github.com/akhil-gautam/toktracker.git
cd toktracker/cli
npm ci
npm run build
npm link
```

### Mac app — Homebrew cask

```bash
brew tap akhil-gautam/tap
brew install --cask tokscale
```

Requires macOS 14 (Sonoma) or newer. The cask pulls a signed + notarized
build from the latest GitHub Release.

### Mac app — direct download

1. Grab `Tokscale-<version>.zip` from the [latest release](https://github.com/akhil-gautam/toktracker/releases).
2. Unzip and drag `Tokscale.app` to `/Applications`.
3. Launch from Spotlight or `open -a Tokscale`.

### Mac app — from source

```bash
git clone https://github.com/akhil-gautam/toktracker.git
cd toktracker/menubar-app
./scripts/build-app.sh release
open build/Tokscale.app
```

This produces an ad-hoc-signed build — fine for personal use, but Gatekeeper
will warn. Use the Homebrew cask or the signed release zip for the clean path.

## Quick start

```bash
# Open the TUI dashboard
tokscale

# Install the Claude Code hook so sessions are captured automatically
tokscale hook install
```

The first launch bootstraps `~/.config/tokscale/` (CLI) and
`~/Library/Application Support/Tokscale/` (Mac app). They use separate SQLite
databases by design — the CLI is for terminals / servers, the Mac app is the
daily driver.

## Repo layout

```
cli/           Node/TypeScript CLI + TUI (React-Ink)
menubar-app/   Swift/SwiftUI menubar app + full dashboard (SwiftPM)
docs/          design notes
```

## Releases

- **CLI** — tag `cli-v<version>` triggers `.github/workflows/publish-cli.yml`
  which runs tests, builds `dist/`, and publishes to npm. After the tag runs,
  bump the tap with `./scripts/bump-tap.sh cli <version>`.
- **Mac app** — tag `mac-v<version>` triggers `.github/workflows/release-mac.yml`
  which builds, codesigns with Developer ID Application, notarizes via
  `notarytool`, staples, and attaches a zip + sha256 to a GitHub Release.
  After the tag runs, bump the tap with `./scripts/bump-tap.sh mac <version>`.

Required repository secrets:

| Secret                                     | Used by                 |
| ------------------------------------------ | ----------------------- |
| `NPM_TOKEN`                                | publish-cli.yml         |
| `APPLE_ID`                                 | release-mac.yml         |
| `APPLE_TEAM_ID`                            | release-mac.yml         |
| `APPLE_APP_SPECIFIC_PASSWORD`              | release-mac.yml         |
| `DEVELOPER_ID_APPLICATION_CERT_P12_BASE64` | release-mac.yml         |
| `DEVELOPER_ID_APPLICATION_CERT_PASSWORD`   | release-mac.yml         |

## License

MIT. See individual subprojects for details.
