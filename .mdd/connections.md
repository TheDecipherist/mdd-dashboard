---
generated: 2026-05-14
doc_count: 3
connection_count: 2
overlap_count: 2
---

# MDD Connections

## Path Tree

```
Dashboard/
├── Core Package  01-mdd-dashboard-package  complete
├── Doc Viewer  02-doc-viewer  draft
└── Project Picker  03-projects-listing  complete
```

## Dependency Graph

```mermaid
graph TD
  N01["01-mdd-dashboard-package"]:::complete
  N02["02-doc-viewer"]:::draft
  N03["03-projects-listing"]:::complete
  N02 --> N01
  N03 --> N01
  classDef complete fill:#00e5cc,color:#000
  classDef in_progress fill:#ffaa00,color:#000
  classDef draft fill:#888,color:#fff
  classDef deprecated fill:#555,color:#aaa
```

## Source File Overlap

| Source File | Referenced By |
|-------------|--------------|
| src/template.ts | 01-mdd-dashboard-package, 02-doc-viewer |
| src/server.ts | 01-mdd-dashboard-package, 02-doc-viewer |

## Warnings

(none)
