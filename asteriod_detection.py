###############################################################
# SINGLE-OBJECT ASTEROID TRACER
# Tracks ONE object across all frames and shows the traced path
###############################################################

import os
import cv2
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.collections import LineCollection
from astropy.io import fits
from astropy.visualization import ZScaleInterval

###############################################################
# CONFIGURATION
###############################################################

DATASET_FOLDER = r"D:\INDRANEEL\CODINGDEX\College\Research_paper\Space_exploration\spacetracing\data"

# Max pixel distance a blob can move between consecutive frames
# and still be considered the "same" object
MAX_LINK_DIST = 15

# Min number of consecutive frames the object must appear in
# to be accepted as a real detection (not noise)
MIN_TRACK_LENGTH = 4

# Min total pixel displacement across the track -- rejects jitter/stars
MIN_TOTAL_DISPLACEMENT = 8

###############################################################
# LOAD FITS IMAGES
###############################################################

def load_fits_images(folder):
    images, filenames = [], []
    for file in sorted(os.listdir(folder)):
        if file.lower().endswith((".fits", ".fit")):
            path = os.path.join(folder, file)
            try:
                hdul = fits.open(path)
                image = hdul[0].data
                hdul.close()
                if image is None:
                    continue
                if image.ndim == 3:
                    image = image[0]
                images.append(image)
                filenames.append(file)
            except Exception as e:
                print(f"  [SKIP] {file}: {e}")
    return images, filenames

###############################################################
# PRE-PROCESS (ZScale + 8-bit)
###############################################################

def preprocess(image):
    img = np.array(image, dtype=np.float32)
    img = np.nan_to_num(img, nan=0.0, posinf=0.0, neginf=0.0)

    interval = ZScaleInterval()
    vmin, vmax = interval.get_limits(img)

    img_clipped = np.clip(img, vmin, vmax)
    if vmax > vmin:
        img_norm = (img_clipped - vmin) / (vmax - vmin) * 255.0
    else:
        img_norm = np.zeros_like(img_clipped)

    img_8bit = np.uint8(img_norm)
    img_blur = cv2.GaussianBlur(img_8bit, (5, 5), 0)
    return img_blur

###############################################################
# MOTION DETECTION
###############################################################

def detect_motion(img1, img2, threshold=20):
    diff = cv2.absdiff(img1, img2)
    # Morphological open to remove single-pixel noise
    kernel = np.ones((3, 3), np.uint8)
    diff = cv2.morphologyEx(diff, cv2.MORPH_OPEN, kernel)
    _, thresh = cv2.threshold(diff, threshold, 255, cv2.THRESH_BINARY)
    return thresh

###############################################################
# BLOB DETECTION -- returns list of (x, y, size) tuples
###############################################################

def detect_blobs(motion_mask):
    params = cv2.SimpleBlobDetector_Params()
    params.filterByArea = True
    params.minArea = 4
    params.maxArea = 500
    params.filterByColor = True
    params.blobColor = 255
    params.filterByCircularity = False
    params.filterByConvexity = False
    params.filterByInertia = False

    detector = cv2.SimpleBlobDetector_create(params)
    keypoints = detector.detect(motion_mask)

    blobs = []
    for kp in keypoints:
        blobs.append((float(kp.pt[0]), float(kp.pt[1]), float(kp.size)))
    return blobs

###############################################################
# GREEDY TRACK BUILDER
###############################################################

def build_tracks(all_frame_blobs, max_dist=MAX_LINK_DIST):
    """
    all_frame_blobs: list of lists  -- one list of (x,y,size) per frame gap.
    Returns: list of dicts: {'start_frame': int, 'points': [(x,y), ...]}
    """
    active_tracks = []
    finished_tracks = []

    for frame_idx, blobs in enumerate(all_frame_blobs):
        if not blobs:
            # No blobs this frame (or sequence boundary shape mismatch)
            finished_tracks.extend(active_tracks)
            active_tracks = []
            continue

        # For each active track, try to extend it with the nearest blob
        used_blob_indices = set()
        new_active = []

        for track in active_tracks:
            last_x, last_y = track['points'][-1]
            best_dist = max_dist
            best_idx = -1

            for bi, (bx, by, _) in enumerate(blobs):
                if bi in used_blob_indices:
                    continue
                d = np.hypot(bx - last_x, by - last_y)
                if d < best_dist:
                    best_dist = d
                    best_idx = bi

            if best_idx >= 0:
                bx, by, _ = blobs[best_idx]
                track['points'].append((bx, by))
                used_blob_indices.add(best_idx)
                new_active.append(track)
            else:
                finished_tracks.append(track)

        # Start new tracks from unmatched blobs
        for bi, (bx, by, _) in enumerate(blobs):
            if bi not in used_blob_indices:
                new_active.append({
                    'start_frame': frame_idx,
                    'points': [(bx, by)]
                })

        active_tracks = new_active

    finished_tracks.extend(active_tracks)
    return finished_tracks

###############################################################
# SELECT THE BEST SINGLE TRACK
###############################################################

def score_track(track_dict):
    """
    Scores a track primarily by how much it moved (real asteroid = real motion)
    and secondarily by straightness (linear trajectory) and length.
    """
    track = track_dict['points']
    if len(track) < 2:
        return 0.0

    xs = np.array([p[0] for p in track])
    ys = np.array([p[1] for p in track])

    # Total path length (sum of steps)
    total_path = sum(np.hypot(xs[i+1]-xs[i], ys[i+1]-ys[i]) for i in range(len(xs)-1))

    # Net displacement (start to end -- penalises zig-zag/stationary noise)
    displacement = np.hypot(xs[-1] - xs[0], ys[-1] - ys[0])

    # Reject nearly-stationary tracks outright
    if displacement < MIN_TOTAL_DISPLACEMENT:
        return 0.0

    # Straightness: how much of the path is net forward progress
    straightness = displacement / (total_path + 1e-6)

    # Average speed per step
    speed = total_path / max(len(track) - 1, 1)

    # Final score: motion dominates, rewarded for length and linearity
    return displacement * straightness * (1 + 0.1 * len(track)) * (1 + 0.05 * speed)

def select_best_track(tracks, min_length=MIN_TRACK_LENGTH):
    # Filter by minimum length
    candidates = [t for t in tracks if len(t['points']) >= min_length]
    if not candidates:
        candidates = tracks  # Relax if nothing qualifies
    if not candidates:
        return None

    # Filter out stationary/near-zero tracks
    moving = [t for t in candidates if score_track(t) > 0]
    if not moving:
        print("  [WARN] All tracks appear stationary. Returning longest track.")
        return max(candidates, key=lambda t: len(t['points']))

    best = max(moving, key=score_track)
    return best

###############################################################
# VISUALIZATION
###############################################################

def visualize(raw_image, track_dict, base_filename):
    """
    Overlay the traced path of the single detected object on
    the specific FITS frame it ends on.
    """
    track = track_dict['points']
    
    img = np.array(raw_image, dtype=np.float32)
    img = np.nan_to_num(img, nan=0.0, posinf=0.0, neginf=0.0)
    interval = ZScaleInterval()
    vmin, vmax = interval.get_limits(img)

    fig, ax = plt.subplots(figsize=(12, 12), facecolor="#0a0a1a")
    ax.set_facecolor("#0a0a1a")

    # --- Background FITS image ---
    ax.imshow(img, cmap="inferno", origin="lower",
              vmin=vmin, vmax=vmax, alpha=0.85)

    xs = np.array([p[0] for p in track])
    ys = np.array([p[1] for p in track])
    n = len(track)

    # --- Glowing trail using a colour-ramped LineCollection ---
    points = np.array([xs, ys]).T.reshape(-1, 1, 2)
    segments = np.concatenate([points[:-1], points[1:]], axis=1)
    t_vals = np.linspace(0, 1, len(segments))

    # Outer glow (wide, transparent)
    lc_glow = LineCollection(segments, array=t_vals, cmap="cool",
                             linewidths=8, alpha=0.25, zorder=3)
    ax.add_collection(lc_glow)

    # Mid glow
    lc_mid = LineCollection(segments, array=t_vals, cmap="cool",
                            linewidths=4, alpha=0.55, zorder=4)
    ax.add_collection(lc_mid)

    # Core bright line
    lc_core = LineCollection(segments, array=t_vals, cmap="cool",
                             linewidths=1.5, alpha=1.0, zorder=5)
    ax.add_collection(lc_core)

    # --- Per-frame position dots ---
    dot_colors = plt.cm.cool(np.linspace(0, 1, n))
    for i, (x, y) in enumerate(track):
        # Outer halo
        ax.plot(x, y, 'o', markersize=12, color=dot_colors[i],
                alpha=0.2, zorder=6)
        # Core dot
        ax.plot(x, y, 'o', markersize=5, color=dot_colors[i],
                markeredgecolor='white', markeredgewidth=0.5,
                alpha=0.9, zorder=7)

    # --- Start / End markers ---
    ax.plot(xs[0], ys[0], '*', markersize=18, color='#00ffcc',
            markeredgecolor='white', markeredgewidth=0.8,
            label=f"Start", zorder=8)
    ax.plot(xs[-1], ys[-1], 'D', markersize=12, color='#ff4466',
            markeredgecolor='white', markeredgewidth=0.8,
            label=f"End", zorder=8)

    # --- Direction arrow ---
    if n >= 2:
        dx = xs[-1] - xs[-2]
        dy = ys[-1] - ys[-2]
        ax.annotate("", xy=(xs[-1], ys[-1]),
                    xytext=(xs[-1] - dx * 2.5, ys[-1] - dy * 2.5),
                    arrowprops=dict(arrowstyle="->", color="#ff4466",
                                   lw=2.0, mutation_scale=18),
                    zorder=9)

    # --- Stats box ---
    total_dist = sum(
        np.hypot(xs[i+1]-xs[i], ys[i+1]-ys[i]) for i in range(n-1)
    )
    displacement = np.hypot(xs[-1]-xs[0], ys[-1]-ys[0])
    stats_text = (
        f"Background   : {base_filename}\n"
        f"Frames tracked : {n}\n"
        f"Path length    : {total_dist:.1f} px\n"
        f"Displacement   : {displacement:.1f} px\n"
        f"Avg speed      : {total_dist/max(n-1,1):.1f} px/frame"
    )
    ax.text(0.02, 0.98, stats_text,
            transform=ax.transAxes,
            fontsize=10, verticalalignment='top',
            fontfamily='monospace',
            color='white',
            bbox=dict(boxstyle='round,pad=0.5', facecolor='#111133',
                      edgecolor='#4488ff', alpha=0.85),
            zorder=10)

    # --- Colour bar for time progression ---
    sm = plt.cm.ScalarMappable(cmap='cool',
                               norm=plt.Normalize(vmin=1, vmax=n))
    sm.set_array([])
    cbar = plt.colorbar(sm, ax=ax, fraction=0.03, pad=0.01,
                        orientation='vertical')
    cbar.set_label("Relative frame progress", color='white', fontsize=10)
    cbar.ax.yaxis.set_tick_params(color='white')
    plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color='white')

    ax.set_title("Single-Object Asteroid Trace", color='white',
                 fontsize=16, fontweight='bold', pad=14)
    ax.tick_params(colors='#888888')
    for spine in ax.spines.values():
        spine.set_edgecolor('#333355')

    ax.legend(loc='lower right', facecolor='#111133',
              edgecolor='#4488ff', labelcolor='white', fontsize=10)

    plt.tight_layout()
    plt.show()

###############################################################
# MAIN PIPELINE
###############################################################

def main():
    print("=" * 60)
    print("  SINGLE-OBJECT ASTEROID TRACER (MULTI-SEQUENCE)")
    print("=" * 60)

    print(f"\n[1/5] Loading FITS images from:\n      {DATASET_FOLDER}")
    images, names = load_fits_images(DATASET_FOLDER)

    if not images:
        print("\n[ERROR] No FITS images found. Check DATASET_FOLDER path.")
        return

    print(f"       Loaded {len(images)} frames: {names[0]} ... {names[-1]}")

    # -- Step 2: Detect blobs per consecutive frame pair ----------
    print("\n[2/5] Running motion detection + blob extraction ...")
    print(f"       Processing {len(images)-1} frame transitions...")
    all_frame_blobs = []

    for i in range(len(images) - 1):
        img1 = preprocess(images[i])
        img2 = preprocess(images[i + 1])
        
        # Check if the images belong to the same sequence (have same dimensions)
        if img1.shape != img2.shape:
            # Different sequences! Do not diff them.
            all_frame_blobs.append([])
            continue

        motion = detect_motion(img1, img2)
        blobs = detect_blobs(motion)
        all_frame_blobs.append(blobs)
        
        # Print progress sparingly when dealing with thousands of frames
        if (i+1) % 100 == 0 or i == len(images) - 2:
            print(f"       ... processed pair {i+1:4d} / {len(images)-1}")

    # -- Step 3: Build multi-frame tracks --------------------------
    print("\n[3/5] Building tracks ...")
    tracks = build_tracks(all_frame_blobs)
    print(f"       Total candidate tracks: {len(tracks)}")
    
    # Sort briefly to show top 5 candidates
    for ti, tr in enumerate(sorted(tracks, key=lambda t: score_track(t), reverse=True)[:5]):
        print(f"       Track #{ti+1}: {len(tr['points'])} points | startF={tr['start_frame']} | score={score_track(tr):.3f}")

    # -- Step 4: Select the best single track ----------------------
    print("\n[4/5] Selecting best single track across all sequences ...")
    best_track_dict = select_best_track(tracks)

    if best_track_dict is None or len(best_track_dict['points']) < 2:
        print("\n[RESULT] No consistent single object could be tracked.")
        print("         Try lowering MAX_LINK_DIST or MIN_TRACK_LENGTH.")
        return

    best_track_pts = best_track_dict['points']
    start_f = best_track_dict['start_frame']
    
    print(f"         [OK] Best track: {len(best_track_pts)} positions")
    print(f"           Found ending at frame index : {start_f + len(best_track_pts)}")
    print(f"           Start: ({best_track_pts[0][0]:.1f}, {best_track_pts[0][1]:.1f})")
    print(f"           End  : ({best_track_pts[-1][0]:.1f}, {best_track_pts[-1][1]:.1f})")

    xs = [p[0] for p in best_track_pts]
    ys = [p[1] for p in best_track_pts]
    total_dist = sum(
        np.hypot(xs[i+1]-xs[i], ys[i+1]-ys[i]) for i in range(len(xs)-1)
    )
    print(f"           Total path length: {total_dist:.1f} px")

    # -- Step 5: Visualize ----------------------------------------
    print("\n[5/5] Rendering traced path on corresponding background ...")
    
    # The final frame on which this object was detected
    end_f = start_f + len(best_track_pts)
    if end_f >= len(images):
        end_f = len(images) - 1
        
    bg_image = images[end_f]
    bg_name = names[end_f]
    
    visualize(bg_image, best_track_dict, base_filename=bg_name)

    print("\nDone.")


###############################################################
# RUN
###############################################################

if __name__ == "__main__":
    main()