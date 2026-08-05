#!/usr/bin/env bash
set -euo pipefail
mkdir -p public
cp index.html public/index.html
cp logo_volumetria.png public/logo_volumetria.png
cp LAYOUT_FINANCIERO_EJEMPLO.xlsx public/LAYOUT_FINANCIERO_EJEMPLO.xlsx
printf 'BOAG Dashboard listo para publicar en public/\n'
