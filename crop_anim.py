# & 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' -b -P crop_anim.py -- --in "./apps/assets/models/anim_1.glb" --out ".\apps\assets\models\anim_1_cropped.glb"

# anim.py  — overwrite the only animation with ping-pong frames, sampling BEFORE clearing
import bpy
import sys
import os

# -------- CLI ARGS ----------
# Example:
# "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b -P anim.py -- --in ".\in.glb" --out ".\out.glb" --start 11 --end 15 --back_to 12
in_path   = None
out_path  = None
src_start = 11
src_end   = 15
back_to   = 12

if "--" in sys.argv:
    argv = sys.argv[sys.argv.index("--") + 1:]
    it = iter(argv)
    for k in it:
        if k == "--in":
            in_path = next(it, None)
        elif k == "--out":
            out_path = next(it, None)
        elif k == "--start":
            src_start = int(next(it, "11"))
        elif k == "--end":
            src_end = int(next(it, "15"))
        elif k == "--back_to":
            back_to = int(next(it, "12"))

# -------- helpers ----------
def reset_scene():
    bpy.ops.wm.read_homefile(use_empty=True)

def import_glb(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"GLB not found: {path}")
    bpy.ops.import_scene.gltf(filepath=path)

def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_extras=True,
        export_animations=True,
        export_nla_strips=False,       # export only active action per object
        export_force_sampling=False,   # we already wrote explicit keys
        use_selection=False
    )

def find_single_action_user():
    """Return (obj, action) ensuring exactly one active action exists across all objects."""
    users = []
    for obj in bpy.data.objects:
        ad = obj.animation_data
        if ad and ad.action:
            users.append((obj, ad.action))
    if not users:
        raise RuntimeError("No active Action found in the file.")
    # Deduplicate by action name_full
    uniq = {}
    for obj, act in users:
        uniq.setdefault(act.name_full, []).append((obj, act))
    if len(uniq) != 1:
        names = ", ".join(uniq.keys())
        raise RuntimeError(f"Expected exactly one active Action, found: {names}")
    (name, pairs), = uniq.items()
    obj, act = pairs[0]
    return obj, act

def build_sequence(start, end, back_to):
    if not (start <= back_to <= end):
        raise ValueError(f"--back_to must be in [{start}, {end}]")
    forward = list(range(start, end + 1))
    back    = list(range(end - 1, back_to - 1, -1))
    return forward + back

def get_component_value(owner, data_path, array_index):
    """Read EVALUATED RNA (what you see) at current frame."""
    prop = owner.path_resolve(data_path)
    if hasattr(prop, "__getitem__"):
        return float(prop[array_index])
    return float(prop)

# -------- main ----------
def main():
    # fresh scene + import if requested
    if in_path:
        reset_scene()
        import_glb(in_path)

    obj, action = find_single_action_user()
    seq = build_sequence(src_start, src_end, back_to)
    print(f"Overwriting Action '{action.name}' on object '{obj.name}' with frames: {seq}")

    scene = bpy.context.scene
    current = scene.frame_current

    # 1) Gather unique channels (data_path, index -> group_name)
    channels = {}
    for fcu in action.fcurves:
        key = (fcu.data_path, fcu.array_index)
        if key not in channels:
            channels[key] = fcu.group.name if fcu.group else None
    if not channels:
        raise RuntimeError("The Action has no F-Curves to sample.")

    # 2) SAMPLE BEFORE CLEAR: capture evaluated values for each channel at each source frame
    samples = { key: [] for key in channels.keys() }
    try:
        for src_frame in seq:
            scene.frame_set(src_frame)
            bpy.context.view_layer.update()  # ensure depsgraph evaluated
            for (data_path, idx), _grp in channels.items():
                try:
                    val = get_component_value(obj, data_path, idx)
                except Exception:
                    # If a path can't resolve in this rig/frame, keep previous value or zero
                    val = samples[(data_path, idx)][-1] if samples[(data_path, idx)] else 0.0
                samples[(data_path, idx)].append(val)
    finally:
        scene.frame_set(current)

    # 3) Now clear the action (after sampling)
    for fcu in list(action.fcurves):
        action.fcurves.remove(fcu)

    # 4) Recreate F-Curves once and insert keys from samples
    fcurves = {}
    for (data_path, idx), group_name in channels.items():
        fcu = action.fcurves.new(data_path=data_path, index=idx, action_group=group_name)
        fcurves[(data_path, idx)] = fcu

    for i in range(len(seq)):  # destination frames 1..N
        dst_frame = i + 1
        for key, fcu in fcurves.items():
            val = samples[key][i]
            kp = fcu.keyframe_points.insert(frame=dst_frame, value=val, options={'FAST'})
            kp.interpolation = 'LINEAR'

    # 5) Set ranges and ensure action is active
    action.frame_range = (1.0, float(len(seq)))
    scene.frame_start = 1
    scene.frame_end   = len(seq)
    if not obj.animation_data:
        obj.animation_data_create()
    obj.animation_data.action = action

    print(f"Done. Wrote {len(seq)} keys per channel to '{action.name}'.")

    # 6) Export if requested
    if out_path:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        export_glb(out_path)
        print(f"Exported GLB: {out_path}")

if __name__ == "__main__":
    main()
