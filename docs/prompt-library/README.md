# Built-in visual prompt framework

This directory documents the original, workflow-oriented prompt framework used
by Yuming Scroll. It is maintained as part of the project and is licensed under
AGPL-3.0-only with the software source code.

The structured runtime data lives in `src/data/promptLibrary.ts`. It provides:

- Character identity and turnaround constraints
- Reusable scene layout constraints
- Per-segment composition references
- 15-second video continuity constraints

The framework deliberately contains no copied prompt examples, external prompt
collections, customer material, or generated images. It describes how prompts
should preserve user-provided story facts and confirmed project assets; it does
not supply story content.
