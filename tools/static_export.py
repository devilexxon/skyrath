# Export a dragon GLB as a plain static mesh (no skeleton, no animations), keeping the UVs and texture.
import bpy, sys
src, dst = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == "MESH":
        for m in list(o.modifiers): o.modifiers.remove(m)
        o.parent = None
for o in list(bpy.data.objects):
    if o.type != "MESH": bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_animations=False, export_skins=False)
