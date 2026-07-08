# Web SDK Documentation Sync

This directory contains the infrastructure for automatically synchronizing Web SDK documentation from this repository to the Dash0 website documentation.

## Quick Start

### Test Locally

```bash
cd .github/workflows/sync-docs
./test-locally.sh
```

This will generate transformed documentation in `.transformed-docs/` at the repository root.

### Manual Sync

1. Go to Actions → Synchronize Web SDK docs to dash0.com/docs
2. Click "Run workflow"
3. Review the auto-generated PR in the target repository

## Files

- **sync-docs-to-website.yaml** - GitHub Actions workflow (in parent directory)
- **transformations.yaml** - Transformation rules (source of truth)
- **apply-transformations.py** - Transformation engine
- **requirements.txt** - Python dependencies
- **test-locally.sh** - Local testing script
- **CLAUDE.md** - Detailed documentation
- **README.md** - This file

## How It Works

1. INSTALL.md is split into four pages in `setup/` subdirectory:
   - `installation.md` - Prerequisites (lines 1-22, "## Before you begin")
   - `setup.md` - Installation instructions (lines 23-120, "## Setup")
   - `configuration.md` - Configuration options (lines 121-543, "## Configuration")
   - `api.md` - API reference (lines 544+, "## API")

2. Transformations are applied:
   - Remove top-level heading (replaced by frontmatter)
   - Split content at section boundaries ("## Setup", "## Configuration", "## API")
   - Add auto-generated warnings
   - Add cross-references between pages
   - Rewrite external links to internal paths
   - Update GitHub issue links to support contact

3. Frontmatter is generated with title, description, and timestamp

4. Files are written to target repository at `setup/` path and a PR is created

## Repository Secrets

Required secrets (configured in repository settings):

- `DASH0_DOCS_REPO_GITHUB_PAT` - Fine-grained PAT with Contents + PR permissions
- `SYNC_DOCUMENTATION_TARGET_REPOSITORY` - Target repo (e.g., `dash0hq/dash0-website-3`)
- `SYNC_DOCUMENTATION_TARGET_DIRECTORY` - Target path (e.g., `src/app/(core)/docs/content`)

## Editing

### Changing Content

Edit INSTALL.md directly. Changes will sync automatically when pushed to main.

### Changing Transformations

1. Edit `transformations.yaml`
2. Test locally: `./test-locally.sh`
3. Review generated files in `.transformed-docs/`
4. Commit and push

### Changing Split Points

If section headings move (currently "## Setup" at line 23, "## Configuration" at line 121, "## API" at line 544), update:

1. Line numbers in transformations.yaml comments
2. Regex patterns if heading text changes
3. Test locally to verify transformations still work

## Troubleshooting

### "matched nothing" error

The transformation regex didn't find expected content. Check:

1. Section headings in INSTALL.md still match
2. Content structure hasn't changed significantly
3. Set `required: false` if transformation is optional

### Links broken in website

Check:

1. Link rewriting transformations in transformations.yaml
2. Target pages exist in website navigation
3. Paths use extensionless format (no .md)

### Generated content wrong

1. Run `./test-locally.sh`
2. Check transformation order in transformations.yaml
3. Verify regex patterns match current INSTALL.md structure

## See Also

- **CLAUDE.md** - Complete implementation documentation
- **Operator sync** - Similar implementation at `dash0-operator/.github/workflows/sync-docs/`
