#!/usr/bin/env bash
#
# Downloads the browser for one capability of wdio.browsers.conf.ts on a Linux x64 CI runner, and writes its
# path (BROWSER_BINARY) and, for Chrome and Edge, its exact version (BROWSER_VERSION) to $GITHUB_ENV. WebdriverIO
# downloads the matching driver based on that version.
#
# Firefox and Edge baselines are not available via apt (the vendor repositories only keep recent versions), so
# all browsers are downloaded as archives from the vendor and unpacked into the same directory.
#
# Usage: install-browser.sh <capability>
set -euo pipefail

CHROME_BASELINE_MILESTONE="128"
FIREFOX_BASELINE_VERSION="119.0"
EDGE_BASELINE_PACKAGE="microsoft-edge-stable_133.0.3065.92-1_amd64.deb"

DIR="${RUNNER_TEMP:-/tmp}/browser"
CHROME_VERSIONS_URL="https://googlechromelabs.github.io/chrome-for-testing"
EDGE_POOL_URL="https://packages.microsoft.com/repos/edge/pool/main/m"

mkdir -p "$DIR"

install_chrome() {
  local version="$1"
  curl -fsSL -o "$DIR/chrome.zip" "https://storage.googleapis.com/chrome-for-testing-public/$version/linux64/chrome-linux64.zip"
  unzip -q "$DIR/chrome.zip" -d "$DIR"
  echo "BROWSER_BINARY=$DIR/chrome-linux64/chrome" >> "$GITHUB_ENV"
  echo "BROWSER_VERSION=$version" >> "$GITHUB_ENV"
}

install_firefox() {
  curl -fsSL -o "$DIR/firefox.tar" "$1"
  tar -xf "$DIR/firefox.tar" -C "$DIR"
  echo "BROWSER_BINARY=$DIR/firefox/firefox" >> "$GITHUB_ENV"
}

install_edge() {
  local package="$1"
  local file="${2:-}"
  if [ -z "$file" ]; then
    file=$(curl -fsSL "$EDGE_POOL_URL/$package/" | grep -o "${package}_[^\"]*_amd64.deb" | sort -uV | tail -1)
  fi
  curl -fsSL -o "$DIR/edge.deb" "$EDGE_POOL_URL/$package/$file"
  dpkg-deb -x "$DIR/edge.deb" "$DIR"
  local binary
  binary=$(echo "$DIR"/opt/microsoft/msedge*/msedge)
  echo "BROWSER_BINARY=$binary" >> "$GITHUB_ENV"
  echo "BROWSER_VERSION=$("$binary" --version | grep -oE '[0-9]+(\.[0-9]+){3}')" >> "$GITHUB_ENV"
}

case "$1" in
  chrome-latest)
    install_chrome "$(curl -fsSL "$CHROME_VERSIONS_URL/last-known-good-versions.json" | jq -r .channels.Stable.version)"
    ;;
  chrome-beta)
    install_chrome "$(curl -fsSL "$CHROME_VERSIONS_URL/last-known-good-versions.json" | jq -r .channels.Beta.version)"
    ;;
  chrome-baseline)
    install_chrome "$(curl -fsSL "$CHROME_VERSIONS_URL/latest-versions-per-milestone.json" | jq -r ".milestones[\"$CHROME_BASELINE_MILESTONE\"].version")"
    ;;
  firefox-latest)
    install_firefox "https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US"
    ;;
  firefox-beta)
    install_firefox "https://download.mozilla.org/?product=firefox-beta-latest-ssl&os=linux64&lang=en-US"
    ;;
  firefox-baseline)
    install_firefox "https://ftp.mozilla.org/pub/firefox/releases/$FIREFOX_BASELINE_VERSION/linux-x86_64/en-US/firefox-$FIREFOX_BASELINE_VERSION.tar.bz2"
    ;;
  edge-latest)
    install_edge microsoft-edge-stable
    ;;
  edge-beta)
    install_edge microsoft-edge-beta
    ;;
  edge-baseline)
    install_edge microsoft-edge-stable "$EDGE_BASELINE_PACKAGE"
    ;;
  *)
    echo "Unknown capability: $1" >&2
    exit 1
    ;;
esac
