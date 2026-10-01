F16 ARENA — CLEAN VECTOR MASTER

Why this package exists:
The previous PNG package was wrong: it enlarged a small raster crop and one of the
source symbol crops touched the right/bottom canvas edges. That caused soft/jagged
edges and could visually clip the tips.

This package fixes that:
- the symbol silhouette was converted to clean polygonal VECTOR geometry;
- horizontal F16 ARENA artwork was traced into VECTOR paths;
- SVG is now the master source;
- PNG files are rendered FROM SVG, not enlarged from a tiny PNG;
- the SVG viewBoxes contain deliberate safety margins, so no tip touches an edge.

Use SVG on the website whenever possible.
Use PNG only where SVG is unsupported (app icons, some broadcast/print workflows).

Do not run auto-crop on these assets.
Do not trim transparent pixels around the logo.
