#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright 2026 Dash0 Inc.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/.transformed-docs"

echo "=== Dash0 Web SDK Documentation Sync - Local Test ==="
echo ""
echo "Repository root: ${REPO_ROOT}"
echo "Output directory: ${OUTPUT_DIR}"
echo ""

# Clean output directory
if [ -d "${OUTPUT_DIR}" ]; then
  echo "Cleaning existing output directory..."
  rm -rf "${OUTPUT_DIR}"
fi

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv "${SCRIPT_DIR}/.venv"
source "${SCRIPT_DIR}/.venv/bin/activate"

# Install dependencies
echo "Installing dependencies..."
pip install --quiet -r "${SCRIPT_DIR}/requirements.txt"

# Run transformations
echo ""
echo "Running transformations..."
python "${SCRIPT_DIR}/apply-transformations.py" \
  "${REPO_ROOT}" \
  "${SCRIPT_DIR}/transformations.yaml" \
  "${OUTPUT_DIR}"

echo ""
echo "=== Transformation complete ==="
echo ""
echo "Generated files:"
find "${OUTPUT_DIR}" -type f -name "*.md" -exec sh -c 'echo "  - {} ($(wc -l < {} | tr -d " ") lines)"' \;

echo ""
echo "Review the transformed documentation in: ${OUTPUT_DIR}"
echo "To clean up: rm -rf ${OUTPUT_DIR} ${SCRIPT_DIR}/.venv"
