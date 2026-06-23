# Editor Recall Labels

This folder stores human editor labels used to calibrate Phase 5.1 recall.

Each JSONL row describes one human judgement over a source video time range.
Labels are not used as production mocks and must not be loaded by the Worker
candidate generation path.

## Schema

- `source`: stable sample identifier or livestream title.
- `startMs`: original video start time in milliseconds.
- `endMs`: original video end time in milliseconds.
- `label`: `keep`, `maybe`, or `reject`.
- `idealStartMs`: editor-preferred start time.
- `idealEndMs`: editor-preferred end time.
- `topicLabel`: short topic label.
- `editorNote`: why an editor would keep or reject this range.
- `rejectReason`: one Phase 5.1 rejection reason, or `none`.
