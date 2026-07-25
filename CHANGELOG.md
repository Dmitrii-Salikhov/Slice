# Changelog

## 1.0.1 — 2026-07-25

### Added
- Windows folder distribution (`win-unpacked` / zip) via GitHub Actions
- In-app version display and GitHub update check
- Changelog view when a newer release is available
- Update activity log (same retention rules as the error log)
- DICOM tag browser, ellipse ROI, invert/flip, decode workers
- Native menu, hotkeys, dense toolbar, Icon.ico branding

### Changed
- App version set to **1.0.1**
- Metadata-first loading with Int16 LRU pixel cache for large series

### Fixed
- Packaging path prepared for GitHub Releases (`Slice-*-win-x64.zip`)
