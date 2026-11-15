# Custom model import: preview package v1

The Model Editor accepts local glTF 2.0, GLB v2 and OBJ, selects a target animal,
suggests rigid-part mappings, previews reduced geometry and downloads JSON. Nothing
is uploaded. This stage cannot patch ROMs. The original crystal sample is CC0.

## Modules and plain data

`src/viewer/js/import/` contains dependency-free stages exposed through `ModelImport`.
Each stage returns ordinary arrays/objects and leaves its inputs unchanged:

1. `parse.js`: `parse(file, companions)` returns meshes, images and warnings.
   Meshes hold positions, triangle indices, UVs, material index and optional joints,
   weights and bone names. glTF supports node transforms, stride, normalized accessor
   components and selected external buffers/images. No remote resource fetches.
   OBJ polygons are fan-triangulated; pre-triangulate concave faces. Required extensions,
   compression, sparse accessors, morphs and non-triangle primitives are rejected.
   Animation is not evaluated; geometry is imported in its bind form.
2. `segment.js`: `segment(model)` returns rigid segments and warnings. Each triangle
   goes to the bone with greatest summed corner weight. Shared vertices are copied
   between segments. Cross-bone faces warn: this approximates rigid boundaries rather
   than clipping triangles along continuous weights. `autoMap` matches names first,
   then normalized relative centers. Every segment has a manual target override.
3. `decimate.js`: `decimate(segment, budget)` returns reduced geometry plus before,
   budget and reached. Quadric error sums normalized face-plane quadrics; collapse
   candidates include the solved minimum, endpoints and midpoint. Reject inverted or
   degenerate faces, nonmanifold links and incompatible boundary edges. Quadrics
   accumulate through collapses. Segments/material primitives remain separate. UVs
   interpolate; inspect appearance and seams. Topology may prevent reaching a budget.
   Preview limit: 6000 triangles per segment. Future work: heap and worker for scale.
4. `texture.js`: `texture(rgba, width, height, format)` returns indexed bytes, padded
   RGBA5551 palette, dimensions and byte counts. Nearest-neighbor resize, frequent-colour
   palette selection and nearest-colour mapping produce CI4 64x64 (2048 + 32 palette
   bytes) or CI8 32x64 (2048 + 512). Both fit the supplied conservative 4096-byte TMEM
   ceiling including palette. Alpha is thresholded. UI assigns the converted preview
   to a target part. The first embedded image is offered; local PNG/JPEG can replace it.
   Full multi-material/shader translation remains future work.
5. `output.js`: `output(...)` returns `model-import-package-v1`: target animal/part IDs,
   reduced meshes, local-index batches of at most 32 vertices, optional texture and
   warnings. No addresses or ROM mutations. `ui.js` adapts editor state and provides
   before/after orbitable wireframes, live counts, mapping and budget controls.

## Budgets and writer boundary

Original parsed triangles set each part's ceiling. Segments sharing a target share
that ceiling proportionally; manual limits can reduce it further. Byte estimates
use batched 16-byte vertices, 8-byte load commands and paired triangle commands.
Sharing, material commands, alignment and actual loader allocations differ. These
are estimates, not verified RAM sizes. Per-animal level buffers are fixed; exceeding
original triangles or estimated bytes warns in both UI and JSON. A failed reduction
never silently claims success. Stock budgets must exclude texel preview subdivisions.

Before any writer is enabled, Claude must supply exact allocation metadata and source
identity, resolve donor-local transforms and attachments, translate materials, regenerate
normals, check signed coordinate/UV ranges, implement actual display-list encoding with
32-vertex cache and TMEM commands, and add allocation/relocation and expected-byte ROM
checks. Then validate dry-run output, ROM/IPS round trips and in-game behavior. Never
route this package straight to an existing writer. Import packages remain separate from
recolour/deform projects. No runtime or in-game correctness is claimed here.

## Verification

`node tests/test_model_import.js` covers original synthetic OBJ/glTF, hierarchy transforms,
rigid segmentation, QEM 8-to-4 reduction, immutability, 32-vertex batches, texture sizes
and warning propagation. Browser evidence is a separate validation boundary.
