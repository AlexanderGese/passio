#!/usr/bin/env bash
# Installs the .seed MIME type + icon on the user's system. Safe to re-run.
# Runs at package install time via the deb's postinst, or can be run
# manually after an AppImage install.
set -euo pipefail

PREFIX="${PREFIX:-/usr/local}"
RESOURCES="${PASSIO_RESOURCES:-${PREFIX}/share/passio}"

install_for() {
  local scope="$1"
  local data_dir
  local icon_dir
  if [[ "$scope" == "user" ]]; then
    data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
    icon_dir="$data_dir/icons/hicolor"
  else
    data_dir="/usr/share"
    icon_dir="/usr/share/icons/hicolor"
  fi

  mkdir -p "$data_dir/mime/packages" "$icon_dir/32x32/mimetypes" \
           "$icon_dir/128x128/mimetypes" "$icon_dir/256x256/mimetypes"

  cp "$RESOURCES/passio-seed.xml" "$data_dir/mime/packages/passio-seed.xml"
  cp "$RESOURCES/passio-seed-icon-32.png"  "$icon_dir/32x32/mimetypes/application-x-passio-seed.png"
  cp "$RESOURCES/passio-seed-icon-128.png" "$icon_dir/128x128/mimetypes/application-x-passio-seed.png"
  cp "$RESOURCES/passio-seed-icon-256.png" "$icon_dir/256x256/mimetypes/application-x-passio-seed.png"

  update-mime-database "$data_dir/mime" >/dev/null 2>&1 || true
  gtk-update-icon-cache -f "$icon_dir" >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--user" ]]; then
  install_for user
  echo "Installed .seed MIME + icon to $HOME/.local/share."
else
  install_for system
  echo "Installed .seed MIME + icon system-wide."
fi
