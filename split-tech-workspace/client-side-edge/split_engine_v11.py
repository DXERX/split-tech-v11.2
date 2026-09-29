"""
SplitTech AI Engine V11.2 — Dynamic Polymorphic SaaS
ByteTrack + ReID + Zone Analytics + Text-Only Gemini
Stack: GCP Cloud Run API -> Cloud SQL (PostgreSQL)

Architecture (per camera):
  RTSPReader (2 FPS) -> DetectionTracker (YOLO+ByteTrack)
  -> PersonClassifier (5-layer staff/customer)
  -> ZoneAnalyzer (PolygonZone + LineZone)
  -> DataAggregator (10-min windows)

Multi-Camera Orchestrator:
  CameraPipeline (threaded, one per camera)
  -> MultiCameraAggregator (merges per-camera payloads)
  -> CustomQuestionAnswerer (rule-based from combined data)
  -> GeminiTextAnalyzer (cross-camera correlation)

Subscription Tiers:
  Basic  (199 SAR) -> 1 camera
  Pro    (399 SAR) -> 3 cameras
  Enterprise (799 SAR) -> 6 cameras
"""

import cv2
import numpy as np
import time
import json
import gc
import logging
import requests
import threading
import queue
import io
import hashlib
import random
from collections import defaultdict, deque
from datetime import datetime, timezone, date, timedelta
from logging.handlers import RotatingFileHandler
import sys
import os
import signal

# ── Dependencies ──────────────────────────────────────────────────────────────
from ultralytics import YOLO
import supervision as sv

# ReID — lightweight osnet_x0_25 for CPU
try:
    import torchreid
    import torch
    REID_AVAILABLE = True
except ImportError:
    REID_AVAILABLE = False

# =============================================================================
# CONFIG
# =============================================================================

API_BASE = os.environ.get(
    "SPLITTECH_API_URL",
    "https://splittech-api-170306286467.me-central2.run.app"
).rstrip("/")

INGEST_URL     = f"{API_BASE}/v1/ingest-audit"
CONFIG_URL     = f"{API_BASE}/v1/engine-config"
HEARTBEAT_URL  = f"{API_BASE}/v1/engine-heartbeat"
ANALYZE_URL    = f"{API_BASE}/v1/analyze-data"      # NEW: text-only Gemini endpoint
SNAPSHOT_URL   = f"{API_BASE}/v1/store/snapshot"    # V11.2: push camera frame for zone config

CONFIG_FILE = os.environ.get(
    "SPLITTECH_CONFIG",
    os.path.join(os.path.expanduser("~"), ".splittech", "config.json")
)

MODELS_DIR = os.path.join(os.path.expanduser("~"), ".splittech", "models")
os.makedirs(MODELS_DIR, exist_ok=True)
YOLO_MODEL_PATH = os.path.join(MODELS_DIR, "yolov8n.pt")
REID_MODEL_PATH = os.path.join(MODELS_DIR, "osnet_x0_25.pth")

def _ensure_yolo_model():
    """Ensure yolov8n.pt is in MODELS_DIR before loading.

    Priority:
      1. Already present → nothing to do.
      2. Bundled with PyInstaller → copy from _MEIPASS to MODELS_DIR.
      3. Download from Ultralytics GitHub (~6 MB).
    """
    if os.path.exists(YOLO_MODEL_PATH):
        return

    # --- 1. Bundled resource (PyInstaller frozen) ---
    if getattr(sys, 'frozen', False):
        bundled = os.path.join(sys._MEIPASS, 'yolov8n.pt')
        if os.path.exists(bundled):
            import shutil
            print(f"[INIT] Copying bundled yolov8n.pt → {YOLO_MODEL_PATH}", flush=True)
            shutil.copy2(bundled, YOLO_MODEL_PATH)
            print("[INIT] Model ready.", flush=True)
            return

    # --- 2. Download ---
    url = "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt"
    print(f"[INIT] yolov8n.pt not found. Downloading from Ultralytics (~6 MB)…", flush=True)
    print(f"[INIT] Destination: {YOLO_MODEL_PATH}", flush=True)
    try:
        import urllib.request
        def _progress(block, block_size, total):
            if total > 0:
                pct = min(100, block * block_size * 100 // total)
                print(f"\r[INIT] Downloading… {pct}%", end="", flush=True)
        urllib.request.urlretrieve(url, YOLO_MODEL_PATH, reporthook=_progress)
        print(f"\n[INIT] Download complete: {YOLO_MODEL_PATH}", flush=True)
    except Exception as exc:
        print(f"\n[INIT] ERROR: Could not download yolov8n.pt: {exc}", flush=True)
        print("[INIT] Place yolov8n.pt manually in:", MODELS_DIR, flush=True)
        sys.exit(1)

_ensure_yolo_model()

def _load_credentials():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        return cfg.get("store_id", ""), cfg.get("api_key", ""), cfg
    except Exception:
        return "", "", {}

STORE_ID, API_KEY, LOCAL_CONFIG = _load_credentials()

# ── Timing ───────────────────────────────────────────────────────────────────
TARGET_FPS           = 2           # default RTSP read rate (overridden per camera type)
DOOR_CAMERA_FPS      = 10          # door/entrance cameras need higher FPS for LineZone
SERVICE_CAMERA_FPS   = 2           # service/waiting cameras: slow movement, 2 FPS fine
AGGREGATION_WINDOW   = 600        # 10 minutes — push cycle
CONFIG_SYNC_INTERVAL = 300        # 5 minutes
HEARTBEAT_INTERVAL   = 30         # 30 seconds
SNAPSHOT_INTERVAL    = 300        # 5 minutes — push camera frame to API for zone config
MIN_TRACK_FRAMES     = 8          # min frames tracked before counting (filters false positives, ~4s @2FPS)
MIN_UNIQUE_DURATION  = 60         # seconds — min tracked duration to count as "unique customer"
                                  # prevents ReID fragments (same person w/ new ID) inflating counts
MAX_CONSECUTIVE_FAILURES = 10
MAX_TELEMETRY_QUEUE_SIZE = 1000
TELEMETRY_RETRY_ATTEMPTS = 4
TELEMETRY_BACKOFF_BASE = 2
TELEMETRY_BACKOFF_MAX = 60
TELEMETRY_FLUSH_INTERVAL = 10

# ── CPU load scaling: max simultaneous YOLO threads ──────────────────────────
# Prevents CPU meltdown on weak hardware (POS machines, i3, etc.)
# YOLO inference runs sequentially via a shared lock — cameras take turns
_yolo_lock = threading.Lock()

# ── ReID thresholds ──────────────────────────────────────────────────────────
REID_MATCH_THRESHOLD    = 0.45    # cosine distance — below = same person (was 0.35, too strict → fragmentation)
STAFF_DURATION_FALLBACK = 7200    # 2 hours — person seen > 2h = staff
STAFF_MISMATCH_WINDOW   = 300    # 5 minutes — if excess persons for 5min = staff (was 900)
STAFF_EARLY_PROMOTE_SECS = 90    # 90s continuous presence → staff candidate (helps session start)

# =============================================================================
# LOGGING
# =============================================================================

LOG_DIR   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
QUEUE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "queue")
STATS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stats")
os.makedirs(LOG_DIR,   exist_ok=True)
os.makedirs(QUEUE_DIR, exist_ok=True)
os.makedirs(STATS_DIR, exist_ok=True)

PENDING_UPLOADS_FILE  = os.path.join(QUEUE_DIR, "pending_uploads.json")
ANALYSIS_HISTORY_FILE = os.path.join(QUEUE_DIR, "analysis_history.json")
MAX_PENDING_UPLOADS   = 500
MAX_HISTORY_ENTRIES   = 10

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

logger = logging.getLogger("SplitTech")
logger.setLevel(logging.INFO)
_fh = RotatingFileHandler(
    os.path.join(LOG_DIR, "engine.log"),
    maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8",
)
_fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(_fh)
_ch = logging.StreamHandler()
_ch.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(_ch)


# =============================================================================
# 1. RTSP READER — threaded continuous stream at 2 FPS
# =============================================================================

class RTSPReader:
    """
    Threaded RTSP reader — grabs frames at TARGET_FPS.
    Consumer calls get_frame() to get the latest frame.
    """

    def __init__(self, rtsp_url: str, fps: int = TARGET_FPS):
        self.rtsp_url = rtsp_url
        self.fps = fps
        self._frame_queue = queue.Queue(maxsize=4)
        self._cap = None
        self._running = False
        self._thread = None
        self._lock = threading.Lock()
        self._consecutive_failures = 0

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info(f"📷 RTSPReader started @ {self.fps} FPS")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        self._release()
        logger.info("📷 RTSPReader stopped")

    def _release(self):
        with self._lock:
            if self._cap is not None:
                try:
                    self._cap.release()
                except Exception:
                    pass
                self._cap = None

    def _connect(self) -> bool:
        self._release()
        try:
            cap = cv2.VideoCapture(self.rtsp_url)
            if cap.isOpened():
                with self._lock:
                    self._cap = cap
                self._consecutive_failures = 0
                logger.info("📷 RTSP connected")
                return True
            cap.release()
        except Exception as e:
            logger.warning(f"RTSP connect error: {e}")
        self._consecutive_failures += 1
        return False

    def _read_loop(self):
        interval = 1.0 / self.fps
        while self._running:
            with self._lock:
                cap = self._cap

            if cap is None or not cap.isOpened():
                if not self._connect():
                    time.sleep(2)
                    continue

            t0 = time.monotonic()
            try:
                with self._lock:
                    cap = self._cap
                if cap is None:
                    continue
                ret, frame = cap.read()
                if not ret or frame is None:
                    self._release()
                    time.sleep(0.5)
                    continue

                # Put in queue — drop old if full
                if self._frame_queue.full():
                    try:
                        self._frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                self._frame_queue.put(frame)

            except Exception as e:
                logger.warning(f"RTSP read error: {e}")
                self._release()
                time.sleep(1)
                continue

            elapsed = time.monotonic() - t0
            sleep_time = max(0, interval - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

    def get_frame(self):
        """Get latest frame (non-blocking). Returns None if no frame."""
        frame = None
        while not self._frame_queue.empty():
            try:
                frame = self._frame_queue.get_nowait()
            except queue.Empty:
                break
        return frame

    @property
    def is_connected(self):
        with self._lock:
            return self._cap is not None and self._cap.isOpened()

    @property
    def consecutive_failures(self):
        return self._consecutive_failures


# =============================================================================
# 2. DETECTION TRACKER — YOLO + ByteTrack via supervision
# =============================================================================

class DetectionTracker:
    """
    YOLO detection + ByteTrack tracking.
    Returns tracked detections with unique tracker_ids.
    """

    def __init__(self):
        logger.info("Loading YOLOv8n model...")
        self.model = YOLO(YOLO_MODEL_PATH)
        logger.info("YOLOv8n loaded")

        # ByteTrack from supervision
        self.tracker = sv.ByteTrack(
            track_activation_threshold=0.4,
            lost_track_buffer=60,        # keep lost tracks for 30s @ 2fps
            minimum_matching_threshold=0.8,
            frame_rate=TARGET_FPS,
        )
        # Default classes: persons + phones. Overridden per-pipeline from server config.
        self._active_classes: list = [0, 67]

    def set_classes(self, classes: list):
        """Called by CameraPipeline after loading server config."""
        self._active_classes = classes
        logger.info(f"DetectionTracker: target classes = {classes}")

    def process_frame(self, frame: np.ndarray) -> tuple:
        """
        Run YOLO + ByteTrack on a single frame.
        YOLO inference is serialized via _yolo_lock to prevent CPU meltdown
        when multiple camera pipelines run concurrently.

        Detects BOTH persons (class 0) AND cell phones (class 67) for
        the BehaviorAccumulator anti-occlusion phone detection.

        Returns: (sv.Detections with tracker_id, raw_yolo_result)
        """
        with _yolo_lock:
            results = self.model(
                frame, conf=0.60,    # raised from 0.55 — fewer ghost detections
                iou=0.45,            # NMS IoU threshold — removes duplicate boxes
                classes=self._active_classes,
                verbose=False,
            )[0]

        if len(results.boxes) == 0:
            return sv.Detections.empty(), results

        # Filter persons only for ByteTrack (phones don't get tracker IDs)
        detections = sv.Detections.from_ultralytics(results)
        person_mask = detections.class_id == 0
        person_detections = detections[person_mask]

        tracked = self.tracker.update_with_detections(person_detections)
        return tracked, results   # return raw results for phone detection

    def reset(self):
        """Reset tracker state (e.g. on camera reconnect)."""
        self.tracker.reset()


# =============================================================================
# 3. PERSON CLASSIFIER — 5-layer staff/customer classification
# =============================================================================

class PersonClassifier:
    """
    5-Layer Classification:
      Layer 1: Staff Lock-in — known staff ReID features
      Layer 2: ReID Matching — match against seen persons
      Layer 3: staff_count Mismatch — if more persons than staff for 15min
      Layer 4: Duration Fallback — person seen > 2 hours = staff
      Layer 5: Zone Analytics — default to customer if not classified
    """

    def __init__(self, staff_count: int = 0):
        self.staff_count = staff_count

        # ReID extractor
        self._reid_extractor = None
        if REID_AVAILABLE:
            try:
                self._reid_extractor = torchreid.utils.FeatureExtractor(
                    model_name='osnet_x0_25',
                    model_path=REID_MODEL_PATH if os.path.exists(REID_MODEL_PATH) else '',
                    device='cpu',
                )
                logger.info("ReID (osnet_x0_25) loaded on CPU")
            except Exception as e:
                logger.warning(f"ReID load failed: {e} — running without ReID")
                self._reid_extractor = None

        # ── Person registry ──────────────────────────────────────────────────
        # person_id -> PersonRecord
        self._persons = {}
        # Staff ReID features (locked in)
        self._staff_features = {}    # person_id -> feature_vector
        # tracker_id -> person_id mapping
        self._tracker_to_person = {}
        self._next_person_id = 1

    def update_staff_count(self, count: int):
        self.staff_count = count

    def classify(self, tracked_detections: sv.Detections, frame: np.ndarray,
                 timestamp: float) -> dict:
        """
        Classify each tracked detection as 'staff' or 'customer'.
        Returns dict: tracker_id -> {person_id, role, confidence, first_seen, last_seen}
        """
        results = {}

        if tracked_detections.tracker_id is None or len(tracked_detections) == 0:
            return results

        for i, tracker_id in enumerate(tracked_detections.tracker_id):
            tracker_id = int(tracker_id)
            bbox = tracked_detections.xyxy[i].astype(int)

            # Get or create person record
            person_id = self._get_or_create_person(tracker_id, bbox, frame, timestamp)
            person = self._persons[person_id]
            person['last_seen'] = timestamp
            person['total_frames'] += 1

            # V11.2: require minimum track age before counting
            # Filters false positives (shadows, reflections, 1-frame ghost detections)
            if person['total_frames'] < MIN_TRACK_FRAMES:
                continue

            # ── Layer 1: Staff Lock-in ───────────────────────────────────────
            if person_id in self._staff_features:
                role = 'staff'
                confidence = 0.95
            # ── Layer 2: ReID Match against known staff ──────────────────────
            elif self._reid_extractor is not None and self._staff_features:
                feature = self._extract_feature(frame, bbox)
                if feature is not None:
                    match_id, dist = self._find_closest_staff(feature)
                    if match_id and dist < REID_MATCH_THRESHOLD:
                        role = 'staff'
                        confidence = 0.90
                        # Update mapping
                        self._tracker_to_person[tracker_id] = match_id
                        person_id = match_id
                        person = self._persons[person_id]
                    else:
                        role, confidence = self._classify_by_duration(person, timestamp)
                else:
                    role, confidence = self._classify_by_duration(person, timestamp)
            else:
                role, confidence = self._classify_by_duration(person, timestamp)

            # ── Layer 3: staff_count Mismatch ────────────────────────────────
            # Done after all persons classified (post-processing below)

            person['role'] = role
            person['confidence'] = confidence

            results[tracker_id] = {
                'person_id': person_id,
                'role': role,
                'confidence': confidence,
                'first_seen': person['first_seen'],
                'last_seen': timestamp,
                'duration_seconds': timestamp - person['first_seen'],
            }

        # ── Layer 3: staff_count Mismatch post-processing ────────────────────
        self._enforce_staff_count(results, timestamp)

        return results

    def _classify_by_duration(self, person: dict, now: float) -> tuple:
        """
        Layer 4: Duration + Shift Pattern Fallback.

        Fixes the "owner/friend sitting all day" false-positive:
        - 2h duration alone is NOT enough — also check total_frames ratio
          (staff appear in many frames; a sitting visitor has low movement frames)
        - Hard cap enforced by Layer 3 (_enforce_staff_count) prevents
          classifying more people as staff than staff_count allows
        """
        duration = now - person['first_seen']
        total_frames = person.get('total_frames', 0)

        if duration >= STAFF_DURATION_FALLBACK:
            # 2h+ seen: check if they appear consistently (staff) vs sporadically (visitor)
            # Expected frames at 2 FPS over 2h = 2 * 7200 = 14400 max
            # A truly present staff member appears in >20% of frames
            expected_max = duration * TARGET_FPS
            appearance_ratio = total_frames / expected_max if expected_max > 0 else 0

            if appearance_ratio >= 0.15:  # seen in at least 15% of frames = consistently present
                return 'staff', 0.80
            else:
                # Sporadically seen over 2h = owner/visitor popping in and out
                return 'unknown', 0.45
        elif duration >= STAFF_MISMATCH_WINDOW:
            return 'unknown', 0.50
        else:
            return 'customer', 0.70

    def _enforce_staff_count(self, results: dict, now: float):
        """
        If more people classified as 'staff' than staff_count,
        demote excess to customer (shortest duration first).
        If fewer staff than staff_count among long-present persons,
        promote longest-unknown to staff.
        """
        if self.staff_count <= 0:
            return

        current_staff = [tid for tid, r in results.items() if r['role'] == 'staff']
        unknowns = [tid for tid, r in results.items() if r['role'] == 'unknown']

        # Too many staff — demote shortest-duration
        if len(current_staff) > self.staff_count:
            by_duration = sorted(current_staff,
                                 key=lambda tid: results[tid]['duration_seconds'])
            for tid in by_duration[:len(current_staff) - self.staff_count]:
                results[tid]['role'] = 'customer'
                results[tid]['confidence'] = 0.60

        # Not enough staff — promote longest candidates
        elif len(current_staff) < self.staff_count:
            need = self.staff_count - len(current_staff)

            # Priority 1: unknowns (15-120 min)
            unknowns_sorted = sorted(unknowns,
                                     key=lambda tid: results[tid]['duration_seconds'],
                                     reverse=True)

            # Priority 2: long-duration customers (>= STAFF_EARLY_PROMOTE_SECS)
            # These are people present since early in the session — likely staff
            long_customers = sorted(
                [tid for tid, r in results.items()
                 if r['role'] == 'customer'
                 and r.get('duration_seconds', 0) >= STAFF_EARLY_PROMOTE_SECS],
                key=lambda tid: results[tid]['duration_seconds'],
                reverse=True
            )

            candidates = unknowns_sorted + long_customers
            for tid in candidates[:need]:
                pid = results[tid]['person_id']
                old_role = results[tid]['role']
                results[tid]['role'] = 'staff'
                results[tid]['confidence'] = 0.70
                # Lock in as staff
                if pid not in self._staff_features:
                    feat = self._persons.get(pid, {}).get('feature')
                    if feat is not None:
                        self._staff_features[pid] = feat
                        logger.info(f"Staff lock-in: person {pid} "
                                    f"(promoted from {old_role}, "
                                    f"{results[tid]['duration_seconds']:.0f}s)")

    def _get_or_create_person(self, tracker_id: int, bbox: np.ndarray,
                               frame: np.ndarray, timestamp: float) -> int:
        """Map tracker_id to a persistent person_id, using ReID if available."""
        if tracker_id in self._tracker_to_person:
            return self._tracker_to_person[tracker_id]

        # Try ReID match against all known persons
        feature = None
        if self._reid_extractor is not None:
            feature = self._extract_feature(frame, bbox)
            if feature is not None:
                best_id, best_dist = self._find_closest_person(feature)
                if best_id is not None and best_dist < REID_MATCH_THRESHOLD:
                    self._tracker_to_person[tracker_id] = best_id
                    self._persons[best_id]['feature'] = feature  # update feature
                    return best_id

        # New person
        pid = self._next_person_id
        self._next_person_id += 1
        self._persons[pid] = {
            'first_seen': timestamp,
            'last_seen': timestamp,
            'total_frames': 0,
            'role': 'unknown',
            'confidence': 0.0,
            'feature': feature,
        }
        self._tracker_to_person[tracker_id] = pid
        return pid

    def _extract_feature(self, frame: np.ndarray, bbox: np.ndarray):
        """Extract ReID feature from person crop."""
        if self._reid_extractor is None:
            return None
        try:
            x1, y1, x2, y2 = bbox
            h, w = frame.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            if x2 - x1 < 20 or y2 - y1 < 40:
                return None
            crop = frame[y1:y2, x1:x2]
            crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            # torchreid expects list of images or PIL
            from PIL import Image
            img = Image.fromarray(crop_rgb).resize((128, 256))
            feature = self._reid_extractor([img])
            return feature[0].cpu().numpy()
        except Exception as e:
            logger.debug(f"ReID feature extraction error: {e}")
            return None

    def _find_closest_staff(self, feature) -> tuple:
        """Find closest match in staff features."""
        if not self._staff_features or feature is None:
            return None, float('inf')
        best_id, best_dist = None, float('inf')
        for pid, sf in self._staff_features.items():
            dist = self._cosine_distance(feature, sf)
            if dist < best_dist:
                best_dist = dist
                best_id = pid
        return best_id, best_dist

    def _find_closest_person(self, feature) -> tuple:
        """Find closest match in all known persons."""
        if feature is None:
            return None, float('inf')
        best_id, best_dist = None, float('inf')
        for pid, person in self._persons.items():
            pf = person.get('feature')
            if pf is None:
                continue
            dist = self._cosine_distance(feature, pf)
            if dist < best_dist:
                best_dist = dist
                best_id = pid
        return best_id, best_dist

    @staticmethod
    def _cosine_distance(a, b) -> float:
        """Cosine distance between two feature vectors."""
        a_flat = a.flatten()
        b_flat = b.flatten()
        dot = np.dot(a_flat, b_flat)
        norm_a = np.linalg.norm(a_flat)
        norm_b = np.linalg.norm(b_flat)
        if norm_a == 0 or norm_b == 0:
            return 1.0
        return 1.0 - (dot / (norm_a * norm_b))

    def get_active_persons(self, now: float, timeout: float = 60.0) -> dict:
        """Get all persons seen within the last `timeout` seconds."""
        active = {}
        for pid, person in self._persons.items():
            if now - person['last_seen'] <= timeout:
                active[pid] = person
        return active

    def cleanup_stale(self, now: float, timeout: float = 3600.0):
        """Remove persons not seen for over `timeout` seconds."""
        stale = [pid for pid, p in self._persons.items()
                 if now - p['last_seen'] > timeout]
        for pid in stale:
            self._persons.pop(pid, None)
            self._staff_features.pop(pid, None)
        # Clean tracker mapping
        stale_trackers = [tid for tid, pid in self._tracker_to_person.items()
                          if pid in stale]
        for tid in stale_trackers:
            self._tracker_to_person.pop(tid, None)


# =============================================================================
# 3b. PERSPECTIVE WARPER — top-down view transform for angled cameras
# =============================================================================

class PerspectiveWarper:
    """
    Corrects angled/side-mounted cameras by warping frame coordinates
    to a top-down (bird's eye) view before zone analysis.

    The operator marks 4 floor corners in ZoneConfig (perspective_points).
    The engine maps those to a flat rectangle, making distance/dwell
    calculations geometrically correct regardless of camera angle.

    Config format (in zone_config):
    {
      "perspective_points": {
        "src": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],  // floor corners in camera view
        "dst_width": 640,
        "dst_height": 480
      }
    }
    """

    def __init__(self):
        self._M = None          # transform matrix
        self._dst_w = 640
        self._dst_h = 480
        self._enabled = False

    def configure(self, perspective_cfg: dict):
        if not perspective_cfg:
            return
        try:
            src_pts = np.float32(perspective_cfg["src"])
            if src_pts.shape != (4, 2):
                logger.warning("perspective_points.src must be 4 points — skipping")
                return
            self._dst_w = perspective_cfg.get("dst_width", 640)
            self._dst_h = perspective_cfg.get("dst_height", 480)
            dst_pts = np.float32([
                [0,           0],
                [self._dst_w, 0],
                [self._dst_w, self._dst_h],
                [0,           self._dst_h],
            ])
            self._M = cv2.getPerspectiveTransform(src_pts, dst_pts)
            self._enabled = True
            logger.info(f"PerspectiveWarper configured: {src_pts.tolist()} → {self._dst_w}x{self._dst_h}")
        except Exception as e:
            logger.warning(f"PerspectiveWarper config error: {e}")

    def warp_frame(self, frame: np.ndarray) -> np.ndarray:
        """Warp the full frame to top-down view."""
        if not self._enabled or self._M is None:
            return frame
        try:
            return cv2.warpPerspective(frame, self._M, (self._dst_w, self._dst_h))
        except Exception as e:
            logger.debug(f"Warp error: {e}")
            return frame

    def warp_points(self, points: np.ndarray) -> np.ndarray:
        """Warp a set of [N,2] pixel points to top-down coordinates."""
        if not self._enabled or self._M is None or len(points) == 0:
            return points
        try:
            pts = points.reshape(-1, 1, 2).astype(np.float32)
            warped = cv2.perspectiveTransform(pts, self._M)
            return warped.reshape(-1, 2)
        except Exception as e:
            logger.debug(f"Warp points error: {e}")
            return points

    def warp_detections(self, detections: 'sv.Detections') -> 'sv.Detections':
        """Warp detection bounding boxes to top-down coordinates."""
        if not self._enabled or self._M is None or len(detections) == 0:
            return detections
        try:
            new_xyxy = detections.xyxy.copy()
            for i, box in enumerate(detections.xyxy):
                x1, y1, x2, y2 = box
                corners = np.float32([[x1, y1], [x2, y1], [x2, y2], [x1, y2]])
                warped = self.warp_points(corners)
                new_xyxy[i] = [warped[:, 0].min(), warped[:, 1].min(),
                               warped[:, 0].max(), warped[:, 1].max()]
            result = sv.Detections(
                xyxy=new_xyxy,
                confidence=detections.confidence,
                class_id=detections.class_id,
                tracker_id=detections.tracker_id,
            )
            return result
        except Exception as e:
            logger.debug(f"Warp detections error: {e}")
            return detections

    @property
    def enabled(self):
        return self._enabled


# =============================================================================
# 3c. ZONE TRANSITION TRACKER — Two-Zone entry/exit (replaces LineZone)
# =============================================================================

class ZoneTransitionTracker:
    """
    Two-zone entry/exit counter — more reliable than LineZone for angled cameras.

    Instead of a single crossing line (which misses fast or oblique crossings),
    define two adjacent zones:
      - outer_zone: area just outside the door
      - inner_zone: area just inside the door

    Logic: if tracker_id appears in outer_zone → then inner_zone within
    TRANSITION_TIMEOUT seconds = entry counted.
    Reverse (inner → outer) = exit counted.

    Config format:
    {
      "entry_zones": {
        "outer": {"polygon": [[x1,y1],...], "name": "outside_door"},
        "inner": {"polygon": [[x1,y1],...], "name": "inside_door"}
      }
    }
    """

    TRANSITION_TIMEOUT = 3.0   # seconds — max time between zone detections

    def __init__(self):
        self._outer_zone = None
        self._inner_zone = None
        self._outer_seen = {}   # tracker_id -> timestamp last seen in outer
        self._inner_seen = {}   # tracker_id -> timestamp last seen in inner
        self.entries = 0
        self.exits = 0
        self._configured = False

    def configure(self, entry_zones_cfg: dict):
        if not entry_zones_cfg:
            return
        try:
            outer_cfg = entry_zones_cfg.get("outer")
            inner_cfg = entry_zones_cfg.get("inner")
            if outer_cfg and inner_cfg:
                self._outer_zone = sv.PolygonZone(
                    polygon=np.array(outer_cfg["polygon"], dtype=np.int32))
                self._inner_zone = sv.PolygonZone(
                    polygon=np.array(inner_cfg["polygon"], dtype=np.int32))
                self._configured = True
                logger.info("ZoneTransitionTracker configured (Two-Zone entry)")
        except Exception as e:
            logger.warning(f"ZoneTransitionTracker config error: {e}")

    def process(self, detections: 'sv.Detections', now: float) -> dict:
        """
        Update entry/exit counts from zone transitions.
        Returns: {entries, exits, net}
        """
        if not self._configured or detections.tracker_id is None:
            return {'entries': self.entries, 'exits': self.exits,
                    'net': self.entries - self.exits}

        try:
            outer_mask = self._outer_zone.trigger(detections=detections)
            inner_mask = self._inner_zone.trigger(detections=detections)
        except Exception as e:
            logger.debug(f"ZoneTransition trigger error: {e}")
            return {'entries': self.entries, 'exits': self.exits,
                    'net': self.entries - self.exits}

        for i, tid in enumerate(detections.tracker_id):
            tid = int(tid)

            in_outer = bool(outer_mask[i]) if i < len(outer_mask) else False
            in_inner = bool(inner_mask[i]) if i < len(inner_mask) else False

            if in_outer:
                self._outer_seen[tid] = now
            if in_inner:
                self._inner_seen[tid] = now

            # Entry: outer → inner within timeout
            if in_inner and tid in self._outer_seen:
                gap = now - self._outer_seen[tid]
                if 0 < gap <= self.TRANSITION_TIMEOUT:
                    self.entries += 1
                    self._outer_seen.pop(tid, None)  # consume
                    logger.debug(f"Entry: tracker {tid} (gap={gap:.1f}s)")

            # Exit: inner → outer within timeout
            if in_outer and tid in self._inner_seen:
                gap = now - self._inner_seen[tid]
                if 0 < gap <= self.TRANSITION_TIMEOUT:
                    self.exits += 1
                    self._inner_seen.pop(tid, None)  # consume
                    logger.debug(f"Exit: tracker {tid} (gap={gap:.1f}s)")

        # Expire stale records
        cutoff = now - self.TRANSITION_TIMEOUT * 4
        self._outer_seen = {k: v for k, v in self._outer_seen.items() if v > cutoff}
        self._inner_seen = {k: v for k, v in self._inner_seen.items() if v > cutoff}

        return {
            'entries': self.entries,
            'exits': self.exits,
            'net': self.entries - self.exits,
        }

    @property
    def configured(self):
        return self._configured


class AdvancedZoneTransitionValidator:
    """
    Multi-frame spatial trigger check.
    Evaluates consecutive zone occupancy to detect entries
    even when a blind angle causes tracker gaps.
    """
    def __init__(self):
        self._matrix: dict = {}   # {tracker_id: [zone_name, ...]}

    def evaluate_transition(self, tracker_id: int, current_zone: str) -> str:
        if tracker_id not in self._matrix:
            self._matrix[tracker_id] = []
        hist = self._matrix[tracker_id]
        if not hist or hist[-1] != current_zone:
            hist.append(current_zone)
            if len(hist) > 10:
                hist.pop(0)
        if 'outer_buffer' in hist and 'interior_service' in hist:
            return 'ENTRY'
        return 'PENDING'

    def clear_stale(self, active_ids: set):
        stale = [k for k in self._matrix if k not in active_ids]
        for k in stale:
            del self._matrix[k]


# =============================================================================
# 3d. BEHAVIOR ACCUMULATOR — Anti-Occlusion phone/behavior detection
# =============================================================================

class BehaviorAccumulator:
    """
    Accumulates behavior violation seconds per tracker_id across the 10-min window.
    Tolerates occlusion gaps — detects broken across frames, sums total duration.

    Currently tracks:
      - phone_use: YOLO class 67 (cell phone) near a person's hand region

    Logic: phone detected near person X for 5s, then occluded for 3s, then 10s more
           → total = 15s → reported as 'phone_use_seconds' in tracking_data

    Threshold: 30 seconds cumulative → classified as violation
    """

    PHONE_PROXIMITY_FACTOR = 0.6    # phone center must be within 60% of person bbox
    PHONE_VIOLATION_THRESHOLD = 30  # seconds — trigger violation report

    def __init__(self):
        # tracker_id -> {'phone_seconds': float, 'last_seen': float}
        self._phone_records = defaultdict(lambda: {'seconds': 0.0, 'last_seen': 0.0})
        self._last_frame_time = None
        self._violations = {}  # tracker_id -> total_seconds

    def process_frame(self, person_detections: 'sv.Detections',
                      all_detections_raw,
                      frame: np.ndarray, now: float,
                      classifications: dict):
        """
        all_detections_raw: raw YOLO result (before ByteTrack) — contains all classes.
        person_detections: ByteTrack-tracked persons only.
        """
        dt = (now - self._last_frame_time) if self._last_frame_time else 0.0
        dt = min(dt, 2.0)  # cap at 2s to avoid big jumps after pauses
        self._last_frame_time = now

        if person_detections.tracker_id is None or all_detections_raw is None:
            return

        # Extract phone boxes from raw detections (class 67)
        phone_boxes = []
        try:
            if hasattr(all_detections_raw, 'boxes') and len(all_detections_raw.boxes) > 0:
                for box_data in all_detections_raw.boxes:
                    cls = int(box_data.cls[0])
                    if cls == 67:  # cell phone
                        phone_boxes.append(box_data.xyxy[0].cpu().numpy()
                                           if hasattr(box_data.xyxy[0], 'cpu')
                                           else box_data.xyxy[0])
        except Exception as e:
            logger.debug(f"Phone box extraction error: {e}")
            return

        if not phone_boxes:
            return

        # For each tracked person, check if any phone overlaps their bbox
        for i, tid in enumerate(person_detections.tracker_id):
            tid = int(tid)
            # Only flag staff (not customers) for phone violations
            role = classifications.get(tid, {}).get('role', 'unknown')
            if role not in ('staff', 'unknown'):
                continue

            person_box = person_detections.xyxy[i]
            px1, py1, px2, py2 = person_box
            pw = px2 - px1
            ph = py2 - py1

            for phone_box in phone_boxes:
                qx1, qy1, qx2, qy2 = phone_box
                phone_cx = (qx1 + qx2) / 2
                phone_cy = (qy1 + qy2) / 2

                # Phone center inside or near person box (upper body)
                in_person_x = (px1 - pw * 0.1) <= phone_cx <= (px2 + pw * 0.1)
                in_person_y = py1 <= phone_cy <= (py1 + ph * 0.75)  # upper 75%

                if in_person_x and in_person_y:
                    rec = self._phone_records[tid]
                    rec['seconds'] += dt
                    rec['last_seen'] = now

                    if rec['seconds'] >= self.PHONE_VIOLATION_THRESHOLD:
                        self._violations[tid] = rec['seconds']
                    break  # one phone per person is enough

    def get_summary(self) -> dict:
        """Return behavior summary for tracking payload."""
        phone_violation_ids = list(self._violations.keys())
        total_phone_seconds = sum(r['seconds'] for r in self._phone_records.values())
        return {
            'phone_use_detected': len(phone_violation_ids) > 0,
            'phone_violation_count': len(phone_violation_ids),
            'total_phone_seconds': round(total_phone_seconds, 1),
            'violating_staff_ids': phone_violation_ids[:5],  # cap for privacy
        }

    def reset(self):
        self._phone_records.clear()
        self._violations.clear()
        self._last_frame_time = None


# =============================================================================
# 4. ZONE ANALYZER — PolygonZone + LineZone from supervision
# =============================================================================

class ZoneAnalyzer:
    """
    Manages zones defined in store config:
      - door_line: LineZone for entry/exit counting
      - zones: list of PolygonZone for occupancy tracking

    Zone config format (from remote config):
    {
      "door_line": [[x1,y1], [x2,y2]],
      "zones": [
        {"name": "entrance", "polygon": [[x1,y1], [x2,y2], ...]},
        {"name": "checkout", "polygon": [...]},
        {"name": "display",  "polygon": [...]},
      ],
      "frame_resolution": [width, height]
    }
    """

    def __init__(self):
        self.door_counter = None
        self.zones = {}              # name -> sv.PolygonZone
        self.zone_counts = {}        # name -> current person count
        self.entries = 0
        self.exits = 0
        self._configured = False
        # Track zone dwell times: zone_name -> person_id -> entry_timestamp
        self._zone_occupants = defaultdict(dict)

    def configure(self, zone_config: dict, frame_width: int = 640,
                  frame_height: int = 480):
        """Apply zone configuration from remote config."""
        if not zone_config:
            return

        try:
            res = zone_config.get("frame_resolution", [frame_width, frame_height])
            fw, fh = res[0], res[1]

            # Door line
            door = zone_config.get("door_line")
            if door and len(door) == 2:
                start = sv.Point(x=door[0][0], y=door[0][1])
                end = sv.Point(x=door[1][0], y=door[1][1])
                self.door_counter = sv.LineZone(
                    start=start,
                    end=end,
                )
                logger.info(f"Door line configured: {door[0]} -> {door[1]}")

            # Polygon zones
            zones_cfg = zone_config.get("zones", [])
            for z in zones_cfg:
                name = z.get("name", "unknown")
                polygon = np.array(z["polygon"], dtype=np.int32)
                self.zones[name] = sv.PolygonZone(
                    polygon=polygon,
                )
                self.zone_counts[name] = 0
                logger.info(f"Zone '{name}' configured with {len(polygon)} points")

            self._configured = True

        except Exception as e:
            logger.warning(f"Zone configuration error: {e}")

    def process(self, tracked_detections: sv.Detections,
                classifications: dict, now: float) -> dict:
        """
        Update zone occupancy and door counts.
        Returns zone metrics dict.
        """
        metrics = {
            'entries': self.entries,
            'exits': self.exits,
            'zones': {},
        }

        if not self._configured:
            return metrics

        # Door counting
        if self.door_counter is not None:
            try:
                self.door_counter.trigger(detections=tracked_detections)
                self.entries = self.door_counter.in_count
                self.exits = self.door_counter.out_count
                metrics['entries'] = self.entries
                metrics['exits'] = self.exits
            except Exception as e:
                logger.debug(f"Door counter error: {e}")

        # Zone occupancy
        for zone_name, zone in self.zones.items():
            try:
                mask = zone.trigger(detections=tracked_detections)
                in_zone_ids = set()

                if tracked_detections.tracker_id is not None:
                    for i, is_in in enumerate(mask):
                        if is_in:
                            tid = int(tracked_detections.tracker_id[i])
                            pid = classifications.get(tid, {}).get('person_id', tid)
                            in_zone_ids.add(pid)

                            # Track entry time
                            if pid not in self._zone_occupants[zone_name]:
                                self._zone_occupants[zone_name][pid] = now

                # Remove persons who left zone
                left = set(self._zone_occupants[zone_name].keys()) - in_zone_ids
                for pid in left:
                    self._zone_occupants[zone_name].pop(pid, None)

                # Count staff vs customers in zone
                staff_in_zone = 0
                customers_in_zone = 0
                for tid, info in classifications.items():
                    if info['person_id'] in in_zone_ids:
                        if info['role'] == 'staff':
                            staff_in_zone += 1
                        else:
                            customers_in_zone += 1

                # Average dwell time for persons currently in zone
                dwell_times = []
                for pid, entry_time in self._zone_occupants[zone_name].items():
                    dwell_times.append(now - entry_time)
                avg_dwell = sum(dwell_times) / len(dwell_times) if dwell_times else 0

                self.zone_counts[zone_name] = len(in_zone_ids)
                metrics['zones'][zone_name] = {
                    'total_persons': len(in_zone_ids),
                    'staff': staff_in_zone,
                    'customers': customers_in_zone,
                    'avg_dwell_seconds': round(avg_dwell, 1),
                }

            except Exception as e:
                logger.debug(f"Zone '{zone_name}' error: {e}")

        return metrics

    def reset_counts(self):
        """Reset entry/exit counters (e.g. daily)."""
        self.entries = 0
        self.exits = 0
        if self.door_counter:
            self.door_counter.in_count = 0
            self.door_counter.out_count = 0


# =============================================================================
# 5. DATA AGGREGATOR — 10-minute window structured JSON
# =============================================================================

class DataAggregator:
    """
    Accumulates per-frame tracking data over a 10-minute window.
    Produces structured JSON for cloud upload and Gemini analysis.
    """

    def __init__(self):
        self.window_start = time.time()
        self.frame_count = 0
        self.person_snapshots = []      # per-frame summaries
        self.peak_persons = 0
        self.peak_customers = 0
        self.total_unique_persons = set()
        self.total_unique_customers = set()
        self.total_unique_staff = set()
        self.zone_history = []          # list of zone metrics per sample
        self.entry_exit_start = (0, 0)  # (entries, exits) at window start

    def record_frame(self, classifications: dict, zone_metrics: dict, now: float):
        """Record one frame's worth of tracking data."""
        self.frame_count += 1

        staff = [v for v in classifications.values() if v['role'] == 'staff']
        customers = [v for v in classifications.values() if v['role'] == 'customer']
        unknowns = [v for v in classifications.values() if v['role'] == 'unknown']

        total = len(classifications)
        if total > self.peak_persons:
            self.peak_persons = total
        if len(customers) > self.peak_customers:
            self.peak_customers = len(customers)

        for v in classifications.values():
            dur = v.get('duration_seconds', 0)
            # Only count as "unique" if tracked long enough to be a real person
            # (prevents ReID fragments — same physical person getting new IDs after
            #  brief occlusion — from inflating unique customer counts)
            if dur >= MIN_UNIQUE_DURATION:
                self.total_unique_persons.add(v['person_id'])
                if v['role'] == 'staff':
                    self.total_unique_staff.add(v['person_id'])
                elif v['role'] == 'customer':
                    self.total_unique_customers.add(v['person_id'])

        # Sample every ~30 seconds (60 frames at 2 FPS)
        if self.frame_count % 60 == 0:
            self.person_snapshots.append({
                'time': datetime.now().strftime("%H:%M:%S"),
                'total': total,
                'staff': len(staff),
                'customers': len(customers),
                'unknowns': len(unknowns),
            })
            if zone_metrics.get('zones'):
                self.zone_history.append({
                    'time': datetime.now().strftime("%H:%M:%S"),
                    **zone_metrics,
                })

    def build_payload(self, zone_metrics: dict, daily_stats: dict) -> dict:
        """Build structured JSON payload for the 10-minute window."""
        now = time.time()
        duration = now - self.window_start

        # Net entries/exits this window
        net_entries = zone_metrics.get('entries', 0) - self.entry_exit_start[0]
        net_exits = zone_metrics.get('exits', 0) - self.entry_exit_start[1]

        payload = {
            'window': {
                'start': datetime.fromtimestamp(self.window_start,
                                                tz=timezone.utc).isoformat(),
                'end': datetime.now(timezone.utc).isoformat(),
                'duration_seconds': round(duration),
                'frames_processed': self.frame_count,
            },
            'persons': {
                'unique_total': len(self.total_unique_persons),
                'unique_staff': len(self.total_unique_staff),
                'unique_customers': len(self.total_unique_customers),
                'peak_simultaneous': self.peak_persons,
                'peak_customers_simultaneous': self.peak_customers,
            },
            'flow': {
                'entries': net_entries,
                'exits': net_exits,
                'net': net_entries - net_exits,
            },
            'zones': zone_metrics.get('zones', {}),
            'timeline': self.person_snapshots[-20:],   # last 20 samples (10 min)
            'zone_timeline': self.zone_history[-20:],
            'daily_stats': daily_stats,
        }
        return payload

    def reset(self, current_entries: int = 0, current_exits: int = 0):
        """Reset for next window."""
        self.window_start = time.time()
        self.frame_count = 0
        self.person_snapshots.clear()
        self.zone_history.clear()
        self.peak_persons = 0
        self.peak_customers = 0
        self.total_unique_persons.clear()
        self.total_unique_customers.clear()
        self.total_unique_staff.clear()
        self.entry_exit_start = (current_entries, current_exits)


# =============================================================================
# 6. CUSTOM QUESTION ANSWERER — rule-based from tracking data
# =============================================================================

class CustomQuestionAnswerer:
    """
    Answers merchant-defined questions using TRACKING DATA only.
    No Gemini — pure rule-based logic.

    Questions come from remote config:
    {
      "custom_questions": [
        "How many customers visited today?",
        "What's the busiest hour?",
        "Average time customers spend in store?",
        "How effective is the display area?",
        ...
      ]
    }
    """

    # Pattern -> handler mapping
    PATTERNS = {
        'customers_today':     ['عدد الزبائن', 'customers today', 'كم زبون', 'عدد العملاء'],
        'busiest_hour':        ['أكثر ساعة', 'busiest hour', 'peak hour', 'ساعة الذروة'],
        'avg_dwell':           ['متوسط الوقت', 'average time', 'dwell time', 'مدة الزيارة'],
        'staff_efficiency':    ['فعالية الموظفين', 'staff efficiency', 'أداء الموظفين'],
        'zone_effectiveness':  ['فعالية المنطقة', 'zone effectiveness', 'display area',
                                'منطقة العرض'],
        'conversion_rate':     ['معدل التحويل', 'conversion rate', 'نسبة الشراء'],
        'current_occupancy':   ['الموجودين الآن', 'current occupancy', 'كم شخص الآن'],
        'entry_exit':          ['دخول وخروج', 'entry exit', 'entries exits'],
    }

    def answer_questions(self, questions: list, tracking_data: dict,
                         daily_stats: dict) -> list:
        """
        Answer each question from tracking data.
        Returns list of {question, answer, data_source} dicts.
        """
        answers = []
        for q in questions:
            q_lower = q.lower()
            handler = self._match_question(q_lower)
            if handler:
                answer = handler(tracking_data, daily_stats)
            else:
                answer = self._generic_answer(q, tracking_data, daily_stats)
            answers.append({
                'question': q,
                'answer': answer,
                'data_source': 'tracking_data',
            })
        return answers

    def _match_question(self, q_lower: str):
        """Match question to a handler."""
        for pattern_key, keywords in self.PATTERNS.items():
            for kw in keywords:
                if kw in q_lower:
                    return getattr(self, f'_answer_{pattern_key}', None)
        return None

    def _answer_customers_today(self, data: dict, stats: dict) -> str:
        total = stats.get('total_customers', 0)
        current = data.get('persons', {}).get('unique_customers', 0)
        return (f"Total customers today: {total}. "
                f"Current window: {current} unique customers.")

    def _answer_busiest_hour(self, data: dict, stats: dict) -> str:
        peak_hour = stats.get('peak_hour', 'N/A')
        peak = stats.get('peak_customers', 0)
        return f"Busiest hour: {peak_hour} with {peak} simultaneous customers."

    def _answer_avg_dwell(self, data: dict, stats: dict) -> str:
        zones = data.get('zones', {})
        dwells = []
        for name, info in zones.items():
            dwell = info.get('avg_dwell_seconds', 0)
            dwells.append(f"{name}: {dwell:.0f}s")
        if dwells:
            return f"Average dwell time by zone: {', '.join(dwells)}"
        return "No zone data available for dwell time calculation."

    def _answer_staff_efficiency(self, data: dict, stats: dict) -> str:
        persons = data.get('persons', {})
        staff = persons.get('unique_staff', 0)
        customers = persons.get('unique_customers', 0)
        ratio = f"{customers/staff:.1f}" if staff > 0 else "N/A"
        return (f"Staff: {staff}, Customers served: {customers}. "
                f"Customer-to-staff ratio: {ratio}")

    def _answer_zone_effectiveness(self, data: dict, stats: dict) -> str:
        zones = data.get('zones', {})
        if not zones:
            return "No zone configuration — cannot measure zone effectiveness."
        parts = []
        for name, info in zones.items():
            count = info.get('customers', 0)
            dwell = info.get('avg_dwell_seconds', 0)
            parts.append(f"{name}: {count} customers, avg dwell {dwell:.0f}s")
        return "Zone effectiveness: " + "; ".join(parts)

    def _answer_conversion_rate(self, data: dict, stats: dict) -> str:
        flow = data.get('flow', {})
        entries = flow.get('entries', 0)
        # Conversion requires POS data — track entries only
        return (f"Entries this window: {entries}. "
                "Conversion rate requires POS integration (not yet available).")

    def _answer_current_occupancy(self, data: dict, stats: dict) -> str:
        persons = data.get('persons', {})
        peak = persons.get('peak_simultaneous', 0)
        staff = persons.get('unique_staff', 0)
        cust = persons.get('unique_customers', 0)
        return f"Peak occupancy: {peak} (staff: {staff}, customers: {cust})"

    def _answer_entry_exit(self, data: dict, stats: dict) -> str:
        flow = data.get('flow', {})
        return (f"Entries: {flow.get('entries', 0)}, "
                f"Exits: {flow.get('exits', 0)}, "
                f"Net: {flow.get('net', 0)}")

    def _generic_answer(self, question: str, data: dict, stats: dict) -> str:
        """Fallback: provide key metrics summary."""
        p = data.get('persons', {})
        f = data.get('flow', {})
        return (f"Current data — Unique persons: {p.get('unique_total', 0)}, "
                f"Staff: {p.get('unique_staff', 0)}, "
                f"Customers: {p.get('unique_customers', 0)}, "
                f"Entries: {f.get('entries', 0)}, Exits: {f.get('exits', 0)}. "
                f"Question '{question}' requires more specific zone/POS data.")


# =============================================================================
# 7. GEMINI TEXT ANALYZER — text-only business analysis
# =============================================================================

class GeminiTextAnalyzer:
    """
    Sends STRUCTURED JSON data (no images) to Gemini for business-level analysis.
    Gemini produces: score, status, summary, observations, ai_reasoning.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key

    def analyze(self, tracking_data: dict, question_answers: list,
                store_config: dict) -> dict:
        """
        Send tracking data + question answers to Gemini for business analysis.
        Returns: {score, status, summary, observations, ai_reasoning, confidence_score}
        """
        prompt = self._build_prompt(tracking_data, question_answers, store_config)

        try:
            resp = requests.post(
                ANALYZE_URL,
                json={
                    "prompt": prompt,
                    "store_id": STORE_ID,
                },
                headers={
                    "x-api-key": self.api_key,
                    "Content-Type": "application/json",
                },
                timeout=60,
            )

            if resp.status_code == 200:
                result = resp.json()
                logger.info(f"Gemini analysis: score={result.get('score')} "
                            f"status={result.get('status')}")
                return result
            else:
                logger.error(f"Gemini API error {resp.status_code}: {resp.text[:200]}")
                return self._fallback_result(tracking_data)

        except Exception as e:
            logger.error(f"Gemini request failed: {e}")
            return self._fallback_result(tracking_data)

    def _build_prompt(self, data: dict, qa: list, config: dict) -> str:
        """Build text-only merchant-facing prompt for Gemini with cross-camera correlation."""
        store_name = config.get("store_name", "Unknown Store")
        store_type = config.get("store_type", "retail")
        staff_count = config.get("staff_count", 0)

        is_multi = data.get('multi_camera', False)
        total_cameras = data.get('total_cameras', 1)

        # Camera descriptions for context
        cameras_desc = ""
        if is_multi and 'cameras' in data:
            cameras_desc = "\n# CAMERAS\n"
            for cam_id, cam_data in data['cameras'].items():
                cam_name = cam_data.get('camera_name', cam_id)
                cameras_desc += f"- {cam_id}: \"{cam_name}\"\n"

        # Compute sanity-check flags to pass to Gemini
        persons_data = data.get('persons', {})
        raw_unique_staff = persons_data.get('unique_staff', 0)
        raw_unique_customers = persons_data.get('unique_customers', 0)
        peak_simultaneous = persons_data.get('peak_simultaneous', 0)

        # If unique_customers >> peak_simultaneous × 10, suspect ReID fragmentation
        reid_warning = ""
        if peak_simultaneous > 0 and raw_unique_customers > peak_simultaneous * 8:
            reid_warning = (
                f"\n⚠️ DATA QUALITY NOTE: unique_customers={raw_unique_customers} "
                f"is unusually high vs peak_simultaneous={peak_simultaneous}. "
                f"This indicates ReID fragmentation (same person counted multiple times). "
                f"Use peak_simultaneous as the reliable customer count for this window. "
                f"Do NOT report {raw_unique_customers} as actual unique customers."
            )

        # If staff=0 but store expects staff, it's likely a calibration issue (first window)
        staff_warning = ""
        if staff_count > 0 and raw_unique_staff == 0:
            staff_warning = (
                f"\n⚠️ STAFF DETECTION NOTE: unique_staff=0 while store expects {staff_count} staff. "
                f"This is likely a detection calibration issue (no zone configuration yet, "
                f"or engine first startup window). Do NOT report this as 'no staff present'. "
                f"Instead note 'موظفو المتجر غير مصنفين بعد — يرجى ضبط مناطق العمل' as a setup note."
            )

        prompt = f"""# ROLE & OBJECTIVE
You are the Chief Business Analyst Engine for the merchant dashboard of "Split Tech". Your job is to translate 100% verified tracking and compliance data into a clean, executive, merchant-facing dashboard view.

CRITICAL RULE: Eliminate all technical jargon, AI probabilities, confidence scores, or pipeline logs. The merchant must only see absolute business facts, operational defects, and strategic advice to increase profits.

CLASSIFICATION ACCURACY NOTE: The staff count is calibrated to exactly {staff_count} employees. Any person counted as "staff" beyond this number is a classification artifact (owner visit, long-stay visitor) — do NOT report inflated staff counts. If unique_staff > {staff_count}, use {staff_count} as the actual staff figure in your analysis.
{reid_warning}{staff_warning}

# STORE INFO
- Store: "{store_name}"
- Type: {store_type}
- Expected staff: {staff_count} (HARD CAP — do not exceed this in reporting)
- Active cameras: {total_cameras}
{cameras_desc}
# TRACKING DATA (Last 10 Minutes)
{json.dumps(data, indent=2, ensure_ascii=False)}

# BEHAVIOR VIOLATIONS (Anti-Occlusion Accumulator — Verified)
{self._extract_behavior_summary(data)}

# CUSTOMER QUESTION ANSWERS (from tracking data)
"""
        for item in qa:
            prompt += f"Q: {item['question']}\nA: {item['answer']}\n\n"

        # Cross-camera correlation instructions (only for multi-camera)
        cross_camera_section = ""
        if is_multi and total_cameras > 1:
            cross_camera_section = """
3. **Cross-Camera Correlation (CRITICAL for multi-camera stores):**
   - Detect LEAKAGE: customers visible in the entrance camera but NOT appearing in the service area camera = potential walkouts.
   - Detect BOTTLENECKS: high occupancy in waiting area (camera X) while service chairs are empty (camera Y) = staff distribution problem.
   - Detect COVERAGE GAPS: if one camera shows activity but adjacent camera shows nothing = possible blind spot or staff absence.
   - Correlate exit patterns: customers exiting quickly (< 3 min between entry camera and exit) = dissatisfied or browsing-only.
   - Each defect MUST include "affected_area" field linking it to the specific camera/zone.
"""

        prompt += f"""
# MERCHANT DASHBOARD LOGIC

1. **Focus on Operational Defects:**
   - Translate violations into "Operational Flaws" affecting customer experience or revenue leaking.
   - Example: Instead of "YOLO detected cell phone with 92% confidence", output "مخالفة انشغال موظف بالهاتف أثناء الخدمة".

2. **Actionable Insights Only:**
   - Your insights must directly tell the owner how to fix the flaw (e.g., re-distributing staff, adjusting shift timings, auditing the POS for leaked cash).
{cross_camera_section}
# MANDATORY RESPONSE FORMAT (STRICT JSON ONLY — NO MARKDOWN)

Output a raw JSON string to be directly parsed by the merchant's front-end dashboard:

{{
  "merchant_greeting": "أهلاً بك يا بطل {store_name}، إليك تحليل أداء منشأتك الحقيقي اليوم:",
  "store_efficiency_rating": <Integer 0-100 evaluating the operational flow>,
  "executive_summary_ar": "<ملخص تنفيذي ممتاز وراقي بالعربي الفصحى يركز على إنتاجية المحل وسير العمل دون ذكر أي مصطلحات تقنية>",
  "operational_defects": [
    {{
      "type": "Violation" | "Revenue Warning" | "Bottleneck" | "Leakage",
      "description_ar": "<وصف العيب الفعلي بالعربي>",
      "affected_area": "<camera_id or zone name — e.g. camera_01_entrance>"
    }}
  ],
  "growth_opportunities_ar": [
    "<مقترح تجاري أول>",
    "<مقترح تجاري ثانٍ>"
  ],
  "camera_specific_status": [
    {{
      "camera_id": "<camera_01>",
      "camera_name": "<اسم الكاميرا>",
      "status": "normal" | "warning" | "critical",
      "summary_ar": "<ملخص حالة هذه الكاميرا>"
    }}
  ],
  "score": <0-100 same as store_efficiency_rating>,
  "status": "pass" | "review" | "fail",
  "summary": "<same as executive_summary_ar>",
  "ai_reasoning": "<شرح منطق التقييم بالعربي — بدون مصطلحات تقنية>",
  "confidence_score": <0.0-1.0>,
  "observations": [
    {{
      "type": "positive" | "negative" | "neutral",
      "text": "<ملاحظة بالعربي>"
    }}
  ]
}}

Scoring guidelines:
- 80-100: ممتاز — حركة زبائن جيدة، موظفون حاضرون، سير عمل سلس
- 60-79: جيد — ملاحظات بسيطة (حركة منخفضة، توزيع غير متساوٍ)
- 40-59: يحتاج مراجعة — مشاكل واضحة (نقص موظفين، حركة ضعيفة جداً)
- 0-39: فشل — مشاكل حرجة (لا يوجد موظفون، مشكلة في المراقبة)

Use Arabic for ALL text fields. Be a Saudi business consultant — practical, direct, profit-focused.
"""
        return prompt

    def _extract_behavior_summary(self, data: dict) -> str:
        """Build a human-readable behavior violations section for the prompt."""
        lines = []
        # Multi-camera: check each camera's behavior
        cameras = data.get('cameras', {})
        if cameras:
            for cam_id, cam_data in cameras.items():
                b = cam_data.get('behavior', {})
                if b.get('phone_use_detected'):
                    lines.append(
                        f"- Camera {cam_id}: موظف استخدم الجوال تراكمياً "
                        f"{b.get('total_phone_seconds', 0):.0f} ثانية "
                        f"({b.get('phone_violation_count', 0)} موظف مخالف) — "
                        f"مكتشف عبر تراكم الفريمات (Anti-Occlusion)"
                    )
        else:
            # Single camera
            b = data.get('behavior', {})
            if b.get('phone_use_detected'):
                lines.append(
                    f"- موظف استخدم الجوال تراكمياً "
                    f"{b.get('total_phone_seconds', 0):.0f} ثانية "
                    f"({b.get('phone_violation_count', 0)} موظف مخالف)"
                )
        return '\n'.join(lines) if lines else "لا توجد مخالفات سلوكية مكتشفة في هذه الدورة."

    def _fallback_result(self, data: dict) -> dict:
        """Generate a basic result when Gemini is unavailable."""
        persons = data.get('persons', {})
        customers = persons.get('unique_customers', 0)
        staff = persons.get('unique_staff', 0)

        score = 70  # default
        if staff == 0 and customers > 0:
            score = 30
            status = 'fail'
        elif customers == 0:
            score = 50
            status = 'review'
        else:
            status = 'pass'

        return {
            'score': score,
            'status': status,
            'summary': f"تحليل تلقائي — موظفين: {staff}، زبائن: {customers}",
            'ai_reasoning': "تم التحليل بدون Gemini (وضع الطوارئ)",
            'confidence_score': 0.4,
            'observations': [
                {'type': 'neutral',
                 'text': f'رُصد {customers} زبون و{staff} موظف في آخر 10 دقائق'}
            ],
        }


# =============================================================================
# 8. DAILY STATS TRACKER — preserved from V10
# =============================================================================

class DailyStatsTracker:
    """Tracks daily customer counts — subtracts staff automatically."""

    def __init__(self):
        self._today = ""
        self._data = {}
        self._prev_customers = 0
        self._ensure_today()

    def _today_str(self) -> str:
        return datetime.now().strftime("%Y-%m-%d")

    def _file(self, day: str) -> str:
        return os.path.join(STATS_DIR, f"{day}.json")

    def _ensure_today(self):
        today = self._today_str()
        if today == self._today:
            return
        self._today = today
        path = self._file(today)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    self._data = json.load(f)
                sessions = self._data.get("sessions", [])
                self._prev_customers = (sessions[-1]["customers_visible"]
                                        if sessions else 0)
                return
            except Exception:
                pass
        self._data = {
            "date": today,
            "total_customers": 0,
            "peak_customers": 0,
            "peak_hour": None,
            "sessions": [],
        }
        self._prev_customers = 0

    def _save(self):
        try:
            with open(self._file(self._today), "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Stats save error: {e}")

    def record(self, total_customers: int, staff_count: int) -> dict:
        """Record a new window. Returns daily summary."""
        self._ensure_today()

        customers_now = max(0, total_customers)
        new_entries = max(0, customers_now - self._prev_customers)

        self._data["total_customers"] += new_entries
        self._prev_customers = customers_now

        now_str = datetime.now().strftime("%H:%M")

        if customers_now > self._data["peak_customers"]:
            self._data["peak_customers"] = customers_now
            self._data["peak_hour"] = now_str

        self._data["sessions"].append({
            "time": now_str,
            "customers_visible": customers_now,
            "new_entries": new_entries,
            "staff_count": staff_count,
        })

        self._save()
        logger.info(
            f"Daily stats | Customers now: {customers_now} | "
            f"New: {new_entries} | Total today: {self._data['total_customers']}"
        )
        return self.summary()

    def summary(self) -> dict:
        self._ensure_today()
        return {
            "date": self._today,
            "total_customers": self._data["total_customers"],
            "peak_customers": self._data["peak_customers"],
            "peak_hour": self._data.get("peak_hour"),
            "sessions_today": len(self._data.get("sessions", [])),
        }


# =============================================================================
# 9. CAMERA PIPELINE — isolated per-camera processing thread
# =============================================================================

TIER_MAX_CAMERAS = {
    'basic': 1,
    'pro': 3,
    'enterprise': 6,
}


class CameraPipeline:
    """
    Self-contained processing pipeline for a single camera.
    Runs in its own thread with isolated ByteTrack, PersonClassifier,
    ZoneAnalyzer, and DataAggregator — no cross-camera data leakage.
    """

    def __init__(self, camera_id: str, camera_name: str, rtsp_url: str,
                 staff_count: int = 0, zone_config: dict = None,
                 yolo_model=None, fps: int = TARGET_FPS):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.rtsp_url = rtsp_url
        self.fps = fps

        # ── Per-camera isolated components ──────────────────────────────
        self.rtsp_reader = RTSPReader(rtsp_url, fps)

        # Share YOLO model across pipelines (thread-safe inference via _yolo_lock)
        # ByteTrack tracker is per-camera (unique tracker IDs per stream)
        self.tracker = DetectionTracker()
        if yolo_model is not None:
            self.tracker.model = yolo_model  # share weights, save memory

        self.classifier = PersonClassifier(staff_count)
        self.zone_analyzer = ZoneAnalyzer()
        self.aggregator = DataAggregator()

        # ── Advanced components ──────────────────────────────────────────
        self.perspective_warper = PerspectiveWarper()
        self.transition_tracker = ZoneTransitionTracker()
        self.behavior_accumulator = BehaviorAccumulator()

        if zone_config:
            self._apply_zone_config(zone_config)

        # V11.2: Dynamic feature flags from server business profile
        self._cam_cfg = {}
        self._track_persons  = True
        self._track_vehicles = False
        self._reid_enabled   = True
        self._business_type  = 'retail'
        self._zone_validator = AdvancedZoneTransitionValidator()

        # ── State ───────────────────────────────────────────────────────
        self._running = False
        self._thread = None
        self._lock = threading.Lock()
        self._latest_payload = None      # last completed 10-min window
        self._latest_classifications = {}
        self._latest_zone_metrics = {}
        self._window_ready = threading.Event()
        self._stats_tracker = DailyStatsTracker()

    def _apply_zone_config(self, zone_config: dict):
        """Apply all zone config including perspective, zones, and transition zones."""
        if not zone_config:
            return
        # Standard zones
        self.zone_analyzer.configure(zone_config)
        # Perspective warp
        if zone_config.get("perspective_points"):
            self.perspective_warper.configure(zone_config["perspective_points"])
        # Two-zone entry tracker
        if zone_config.get("entry_zones"):
            self.transition_tracker.configure(zone_config["entry_zones"])

    def apply_server_config(self, cam_cfg: dict):
        """Apply V11.2 polymorphic business profile from server config."""
        self._cam_cfg = cam_cfg
        self._track_persons  = cam_cfg.get("features", {}).get("track_persons",  True)
        self._track_vehicles = cam_cfg.get("features", {}).get("track_vehicles", False)
        self._reid_enabled   = cam_cfg.get("features", {}).get("reid_enabled",   True)
        self._business_type  = cam_cfg.get("business_type", "retail")

        # Inject dynamic target classes into DetectionTracker
        raw_classes = cam_cfg.get("target_classes", [0, 67])
        # Always include phone class 67 if tracking persons for behavior analysis
        if self._track_persons and 67 not in raw_classes:
            raw_classes = list(raw_classes) + [67]
        self.tracker.set_classes(raw_classes)

        if not self._reid_enabled:
            logger.info(f"[{cam_cfg.get('camera_id', 'cam')}] ReID DISABLED — vehicle/non-person mode")

    def start(self):
        if self._running:
            return
        self._running = True
        self.rtsp_reader.start()
        self._thread = threading.Thread(
            target=self._processing_loop, daemon=True,
            name=f"cam-{self.camera_id}",
        )
        self._thread.start()
        logger.info(f"📹 Camera '{self.camera_name}' ({self.camera_id}) pipeline started")

    def stop(self):
        self._running = False
        self.rtsp_reader.stop()
        if self._thread:
            self._thread.join(timeout=10)
        logger.info(f"📹 Camera '{self.camera_name}' ({self.camera_id}) pipeline stopped")

    def update_config(self, staff_count: int = None, zone_config: dict = None,
                      rtsp_url: str = None):
        """Hot-update config without restarting the pipeline."""
        if staff_count is not None:
            self.classifier.update_staff_count(staff_count)
        if zone_config:
            self._apply_zone_config(zone_config)
        if rtsp_url and rtsp_url != self.rtsp_url:
            logger.info(f"Camera {self.camera_id} RTSP URL changed — reconnecting")
            self.rtsp_reader.stop()
            self.rtsp_url = rtsp_url
            self.rtsp_reader = RTSPReader(rtsp_url, self.fps)
            self.rtsp_reader.start()
            self.tracker.reset()

    def get_snapshot_b64(self) -> str | None:
        """Capture one fresh frame from RTSP and return as base64 JPEG string.

        Flushes the frame queue and waits for a freshly-decoded frame to avoid
        returning a stale or partially-decoded H.264 frame (which causes the
        bottom half of the image to appear corrupted/glitched).
        """
        try:
            import base64
            # Step 1: drain whatever is currently in the queue (may be stale/corrupt)
            self.rtsp_reader.get_frame()
            # Step 2: wait long enough for at least 3 fresh frames to arrive
            # (at 10 fps that's ~300 ms; add margin for slow streams)
            time.sleep(0.6)
            # Step 3: drain again and grab the most recent freshly-decoded frame
            frame = self.rtsp_reader.get_frame()
            if frame is None:
                return None
            # Step 4: basic sanity check — a valid frame has some variance
            # (all-zero or near-zero frames are corrupt/black)
            if frame.std() < 2.0:
                logger.warning(f"[{self.camera_id}] Snapshot: frame looks blank, skipping")
                return None
            # Resize to 960-wide for reasonable payload size
            h, w = frame.shape[:2]
            if w > 960:
                scale = 960 / w
                frame = cv2.resize(frame, (960, int(h * scale)))
            ok, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ok:
                return None
            return base64.b64encode(buf.tobytes()).decode('utf-8')
        except Exception as e:
            logger.warning(f"[{self.camera_id}] Snapshot error: {e}")
            return None

    def get_latest_payload(self) -> dict | None:
        """Get and consume the latest 10-min window payload."""
        with self._lock:
            payload = self._latest_payload
            self._latest_payload = None
            return payload

    def wait_for_window(self, timeout: float = None) -> bool:
        """Block until next 10-min window is ready."""
        return self._window_ready.wait(timeout=timeout)

    @property
    def is_connected(self):
        return self.rtsp_reader.is_connected

    def _processing_loop(self):
        """Per-camera main loop — runs in its own thread."""
        last_cleanup = time.time()

        # Initialize aggregator
        zone_metrics = self.zone_analyzer.process(
            sv.Detections.empty(), {}, time.time())
        self.aggregator.reset(
            zone_metrics.get('entries', 0),
            zone_metrics.get('exits', 0),
        )

        while self._running:
            try:
                frame = self.rtsp_reader.get_frame()
                if frame is None:
                    time.sleep(0.1)
                    continue

                now = time.time()

                # ── Feature 1: Perspective Warp ─────────────────────────
                # Apply top-down transform if configured (angled cameras)
                analysis_frame = self.perspective_warper.warp_frame(frame) \
                    if self.perspective_warper.enabled else frame

                # ── YOLO + ByteTrack (on warped or original frame) ──────
                tracked, raw_results = self.tracker.process_frame(analysis_frame)

                # Warp detection boxes if perspective is active
                if self.perspective_warper.enabled and len(tracked) > 0:
                    tracked = self.perspective_warper.warp_detections(tracked)

                # ── Person Classification ───────────────────────────────
                if self._reid_enabled and self._track_persons:
                    classifications = self.classifier.classify(
                        tracked, analysis_frame, now)
                else:
                    classifications = {}

                # ── Zone Analysis (PolygonZone) ─────────────────────────
                zone_metrics = self.zone_analyzer.process(
                    tracked, classifications, now)

                # ── Feature 2: Two-Zone Entry/Exit ──────────────────────
                # Replaces or supplements LineZone for angled cameras
                if self.transition_tracker.configured:
                    transition_counts = self.transition_tracker.process(tracked, now)
                    # Override door entries/exits with more reliable counts
                    zone_metrics['entries'] = transition_counts['entries']
                    zone_metrics['exits']   = transition_counts['exits']

                # ── Feature 3: Anti-Occlusion Phone Accumulator ─────────
                self.behavior_accumulator.process_frame(
                    tracked, raw_results, analysis_frame, now, classifications)

                # ── Aggregate ───────────────────────────────────────────
                self.aggregator.record_frame(classifications, zone_metrics, now)

                with self._lock:
                    self._latest_classifications = classifications
                    self._latest_zone_metrics = zone_metrics

                # ── Cleanup stale persons every 5 min ───────────────────
                if now - last_cleanup > 300:
                    self.classifier.cleanup_stale(now)
                    last_cleanup = now

                # ── 10-minute window complete? ──────────────────────────
                elapsed = now - self.aggregator.window_start
                if elapsed >= AGGREGATION_WINDOW:
                    unique_customers = len(self.aggregator.total_unique_customers)
                    unique_staff = len(self.aggregator.total_unique_staff)
                    daily_summary = self._stats_tracker.record(
                        unique_customers, unique_staff)

                    payload = self.aggregator.build_payload(
                        zone_metrics, daily_summary)

                    # ── Behavior violations (phone accumulator) ──────────
                    behavior_summary = self.behavior_accumulator.get_summary()
                    payload['behavior'] = behavior_summary
                    self.behavior_accumulator.reset()

                    # ── Advanced feature flags ───────────────────────────
                    payload['perspective_active'] = self.perspective_warper.enabled
                    payload['two_zone_entry_active'] = self.transition_tracker.configured

                    # V11.2: include business context in payload
                    payload['business_type']  = self._business_type
                    payload['track_vehicles'] = self._track_vehicles
                    if self._track_vehicles:
                        payload['total_vehicles']       = len(set(self.aggregator._all_ids)) if hasattr(self.aggregator, '_all_ids') else payload.get('total_visitors', 0)
                        payload['avg_vehicle_dwell_min'] = payload.get('avg_dwell_min', 0)

                    # Tag payload with camera identity
                    payload['camera_id'] = self.camera_id
                    payload['camera_name'] = self.camera_name
                    payload['camera_fps'] = self.fps
                    payload['is_door_camera'] = (self.fps >= DOOR_CAMERA_FPS)

                    with self._lock:
                        self._latest_payload = payload
                    self._window_ready.set()
                    self._window_ready.clear()

                    logger.info(
                        f"[{self.camera_id}] Window complete — "
                        f"{self.aggregator.frame_count} frames | "
                        f"staff: {unique_staff} | customers: {unique_customers}"
                    )

                    # Reset aggregator
                    self.aggregator.reset(
                        zone_metrics.get('entries', 0),
                        zone_metrics.get('exits', 0),
                    )
                    gc.collect()

                time.sleep(0.05)

            except Exception as e:
                logger.error(f"[{self.camera_id}] Pipeline error: {e}", exc_info=True)
                time.sleep(5)

        logger.info(f"[{self.camera_id}] Pipeline thread exited")


# =============================================================================
# 10. MULTI-CAMERA AGGREGATOR — merges per-camera payloads
# =============================================================================

class MultiCameraAggregator:
    """
    Merges payloads from multiple CameraPipelines into a single
    combined payload with per-camera breakdowns for Gemini analysis.
    """

    @staticmethod
    def merge(camera_payloads: dict) -> dict:
        """
        Merge multiple camera payloads into one combined payload.

        Args:
            camera_payloads: dict of camera_id -> payload

        Returns:
            Combined payload with 'cameras' breakdown + aggregated totals.
        """
        if not camera_payloads:
            return {}

        # Single camera — return as-is with wrapper
        if len(camera_payloads) == 1:
            cam_id, payload = next(iter(camera_payloads.items()))
            return {
                'multi_camera': False,
                'total_cameras': 1,
                'combined': payload,
                'cameras': {cam_id: payload},
            }

        # ── Aggregate across cameras ────────────────────────────────────
        combined_persons = {
            'unique_total': 0,
            'unique_staff': 0,
            'unique_customers': 0,
            'peak_simultaneous': 0,
            'peak_customers_simultaneous': 0,
        }
        combined_flow = {'entries': 0, 'exits': 0, 'net': 0}
        combined_zones = {}
        combined_timeline = []
        total_frames = 0
        earliest_start = None
        latest_end = None

        for cam_id, payload in camera_payloads.items():
            # Persons (sum unique per camera — cross-camera dedup is Gemini's job)
            p = payload.get('persons', {})
            combined_persons['unique_total'] += p.get('unique_total', 0)
            combined_persons['unique_staff'] += p.get('unique_staff', 0)
            combined_persons['unique_customers'] += p.get('unique_customers', 0)
            combined_persons['peak_simultaneous'] += p.get('peak_simultaneous', 0)
            combined_persons['peak_customers_simultaneous'] += p.get(
                'peak_customers_simultaneous', 0)

            # Flow
            f = payload.get('flow', {})
            combined_flow['entries'] += f.get('entries', 0)
            combined_flow['exits'] += f.get('exits', 0)
            combined_flow['net'] += f.get('net', 0)

            # Zones (prefix with camera_id to avoid collision)
            for zone_name, zone_data in payload.get('zones', {}).items():
                key = f"{cam_id}_{zone_name}"
                combined_zones[key] = {
                    'camera_id': cam_id,
                    'camera_name': payload.get('camera_name', cam_id),
                    **zone_data,
                }

            # Window timing
            w = payload.get('window', {})
            total_frames += w.get('frames_processed', 0)
            if w.get('start'):
                if earliest_start is None or w['start'] < earliest_start:
                    earliest_start = w['start']
            if w.get('end'):
                if latest_end is None or w['end'] > latest_end:
                    latest_end = w['end']

        # Use first camera's daily stats (they all track the same day)
        first_payload = next(iter(camera_payloads.values()))
        daily_stats = first_payload.get('daily_stats', {})

        combined = {
            'window': {
                'start': earliest_start,
                'end': latest_end,
                'frames_processed': total_frames,
            },
            'persons': combined_persons,
            'flow': combined_flow,
            'zones': combined_zones,
            'daily_stats': daily_stats,
            'timeline': combined_timeline,
            'zone_timeline': [],
        }

        return {
            'multi_camera': True,
            'total_cameras': len(camera_payloads),
            'combined': combined,
            'cameras': camera_payloads,
        }


# =============================================================================
# 11. MAIN ENGINE — multi-camera orchestrator
# =============================================================================

class SplitTechEngineV11:

    def __init__(self):
        self.config = {}
        self.running = True
        self.total_cycles = 0
        self.total_uploads = 0
        self.last_config_sync = 0
        self.last_heartbeat = 0
        self.last_snapshot = 0

        # Offline queue
        self.pending_uploads = self._load_pending_uploads()
        self.analysis_history = self._load_analysis_history()
        self._pending_lock = threading.Lock()
        self._telemetry_queue = queue.Queue(maxsize=MAX_TELEMETRY_QUEUE_SIZE)
        self._telemetry_stop = threading.Event()
        self._telemetry_thread = threading.Thread(
            target=self._telemetry_worker_loop,
            name="SplitTechTelemetryWorker",
            daemon=True,
        )
        self._telemetry_thread.start()

        # Shared YOLO model (loaded once, shared across camera pipelines)
        logger.info("Loading shared YOLOv8n model...")
        self._shared_yolo = YOLO(YOLO_MODEL_PATH)
        logger.info("Shared YOLOv8n loaded")

        # Multi-camera pipelines: camera_id -> CameraPipeline
        self.pipelines = {}
        self.multi_camera_aggregator = MultiCameraAggregator()

        # Legacy single-camera fallback
        self.rtsp_reader = None

        # Shared components (not per-camera)
        self.question_answerer = CustomQuestionAnswerer()
        self.gemini = GeminiTextAnalyzer(API_KEY)
        self.stats_tracker = DailyStatsTracker()

        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)

    # ── Shutdown ─────────────────────────────────────────────────────────────

    def _handle_shutdown(self, signum, frame):
        logger.info("Shutdown signal received — stopping...")
        self.running = False
        self._telemetry_stop.set()
        # Stop all camera pipelines
        for cam_id, pipeline in self.pipelines.items():
            pipeline.stop()
        # Legacy fallback
        if self.rtsp_reader:
            self.rtsp_reader.stop()

    # ── Offline Queue (preserved from V10) ───────────────────────────────────

    def _load_pending_uploads(self):
        try:
            if os.path.exists(PENDING_UPLOADS_FILE):
                with open(PENDING_UPLOADS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    logger.info(f"Pending queue: {len(data)} items")
                    return data[:MAX_PENDING_UPLOADS]
        except Exception as e:
            logger.warning(f"Queue load error: {e}")
        return []

    def _load_analysis_history(self):
        try:
            if os.path.exists(ANALYSIS_HISTORY_FILE):
                with open(ANALYSIS_HISTORY_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    return data[-MAX_HISTORY_ENTRIES:]
        except Exception as e:
            logger.warning(f"History load error: {e}")
        return []

    def _save_analysis_history(self, result, window_start, window_end):
        entry = {
            "timestamp": window_end,
            "window_start": window_start,
            "window_end": window_end,
            "score": result.get("score"),
            "status": result.get("status"),
            "summary": result.get("summary", ""),
            "ai_reasoning": result.get("ai_reasoning", ""),
            "confidence_score": result.get("confidence_score"),
            "observations": result.get("observations", []),
        }
        self.analysis_history.append(entry)
        self.analysis_history = self.analysis_history[-MAX_HISTORY_ENTRIES:]
        try:
            with open(ANALYSIS_HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump(self.analysis_history, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"History save error: {e}")

    def _persist_pending_uploads(self):
        try:
            with self._pending_lock:
                pending_uploads = self.pending_uploads[-MAX_PENDING_UPLOADS:]
            with open(PENDING_UPLOADS_FILE, "w", encoding="utf-8") as f:
                json.dump(pending_uploads, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Queue persist error: {e}")

    def _enqueue_payload(self, payload, kind):
        envelope = {
            "kind": kind,
            "payload": payload,
            "queued_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._pending_lock:
            self.pending_uploads.append(envelope)
            if len(self.pending_uploads) > MAX_PENDING_UPLOADS:
                self.pending_uploads = self.pending_uploads[-MAX_PENDING_UPLOADS:]
            pending_count = len(self.pending_uploads)
        self._persist_pending_uploads()
        logger.warning(f"Offline queue: {kind} ({pending_count} pending)")

    def _post_ingest_payload(self, payload):
        return requests.post(
            INGEST_URL,
            json=payload,
            headers={"Content-Type": "application/json", "x-api-key": API_KEY},
            timeout=30,
        )

    def _queue_telemetry(self, kind: str, url: str, payload: dict,
                         timeout: int = 15, headers: dict | None = None,
                         metadata: dict | None = None) -> bool:
        envelope = {
            "kind": kind,
            "url": url,
            "payload": payload,
            "timeout": timeout,
            "headers": headers or {
                "Content-Type": "application/json",
                "x-api-key": API_KEY,
            },
            "metadata": metadata or {},
            "queued_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            self._telemetry_queue.put_nowait(envelope)
            logger.info(
                f"Telemetry queued: {kind} "
                f"({self._telemetry_queue.qsize()} in memory)"
            )
            return True
        except queue.Full:
            logger.error(f"Telemetry queue full; persisted offline: {kind}")
            if url == INGEST_URL:
                self._enqueue_payload(payload, kind)
            return False

    def _deliver_telemetry(self, envelope: dict) -> bool:
        kind = envelope.get("kind", "telemetry")
        payload = envelope.get("payload", {})
        url = envelope.get("url", INGEST_URL)
        headers = envelope.get("headers") or {
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
        }
        timeout = envelope.get("timeout", 15)

        for attempt in range(1, TELEMETRY_RETRY_ATTEMPTS + 1):
            if self._telemetry_stop.is_set() and attempt > 1:
                break
            try:
                resp = requests.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=timeout,
                )
                if resp.status_code in (200, 201, 202, 204):
                    self._handle_telemetry_success(envelope)
                    return True
                logger.warning(
                    f"Telemetry HTTP {resp.status_code} ({kind}): "
                    f"{resp.text[:160]}"
                )
            except Exception as e:
                logger.warning(f"Telemetry delivery error ({kind}): {e}")

            delay = min(
                TELEMETRY_BACKOFF_MAX,
                TELEMETRY_BACKOFF_BASE ** attempt + random.uniform(0, 1),
            )
            self._telemetry_stop.wait(delay)

        if url == INGEST_URL:
            self._enqueue_payload(payload, kind)
        return False

    def _handle_telemetry_success(self, envelope: dict):
        kind = envelope.get("kind")
        metadata = envelope.get("metadata", {})

        if kind == "audit":
            self.total_uploads += 1
            p = metadata.get("persons", {})
            cams = metadata.get("total_cameras", 1)
            logger.info(
                f"Uploaded â€” score: {metadata.get('score')}% | "
                f"cameras: {cams} | "
                f"staff: {p.get('unique_staff', 0)} | "
                f"customers: {p.get('unique_customers', 0)}"
            )
            if metadata.get("ai_result"):
                self._save_analysis_history(
                    metadata["ai_result"],
                    metadata.get("window_start", ""),
                    metadata.get("window_end", ""),
                )
        elif kind == "heartbeat":
            self.last_heartbeat = time.time()
            logger.info("[heartbeat-ok]")
        elif kind == "snapshot":
            self.last_snapshot = time.time()
            logger.info(f"[snapshot] Pushed frame from {metadata.get('camera_id')}")
        elif kind == "camera_failure":
            logger.warning(metadata.get("message", "Camera failure reported"))

    def _telemetry_worker_loop(self):
        logger.info("Telemetry worker started")
        last_flush = 0
        while not self._telemetry_stop.is_set() or not self._telemetry_queue.empty():
            now = time.time()
            if now - last_flush >= TELEMETRY_FLUSH_INTERVAL:
                self._flush_pending_uploads()
                last_flush = now

            try:
                envelope = self._telemetry_queue.get(timeout=1)
            except queue.Empty:
                continue

            try:
                self._deliver_telemetry(envelope)
            finally:
                self._telemetry_queue.task_done()

        self._flush_pending_uploads()
        logger.info("Telemetry worker stopped")

    def _flush_pending_uploads(self):
        with self._pending_lock:
            pending_snapshot = list(self.pending_uploads)
        if not pending_snapshot:
            return
        remaining = []
        flushed = 0
        for entry in pending_snapshot:
            try:
                resp = self._post_ingest_payload(entry.get("payload", {}))
                if resp.status_code not in (200, 201):
                    remaining.append(entry)
                    continue
                flushed += 1
            except Exception:
                remaining.append(entry)
                break
        with self._pending_lock:
            self.pending_uploads = remaining
        self._persist_pending_uploads()
        if flushed:
            logger.info(f"Queue flushed: {flushed} items")

    # ── Config & Heartbeat ───────────────────────────────────────────────────

    def sync_remote_config(self):
        try:
            resp = requests.get(
                CONFIG_URL,
                params={"store_id": STORE_ID},
                headers={"x-api-key": API_KEY},
                timeout=10,
            )
            if resp.status_code == 200:
                self.config = resp.json()
                self.last_config_sync = time.time()
                tier = self.config.get('subscription_tier', 'basic')
                logger.info(
                    f"Config synced — active: {self.config.get('is_active')} | "
                    f"tier: {tier} | cameras: {len(self.config.get('cameras', []))}"
                )

                # Update staff count in all pipelines
                staff = int(self.config.get("staff_count", 0) or
                            self._reload_local_config().get("staff_count", 0))

                # ── Multi-camera config hot-update ──────────────────────
                cameras_cfg = self.config.get("cameras", [])
                zone_configs = self.config.get("zone_configs", {})  # camera_id -> zone_config

                for cam_cfg in cameras_cfg:
                    cam_id = cam_cfg.get("camera_id")
                    if cam_id and cam_id in self.pipelines:
                        cam_zone = zone_configs.get(cam_id) or cam_cfg.get("zone_config")
                        self.pipelines[cam_id].update_config(
                            staff_count=staff,
                            zone_config=cam_zone,
                            rtsp_url=cam_cfg.get("rtsp_url"),
                        )

                # Legacy single-camera zone config
                zone_cfg = self.config.get("zone_config")
                if zone_cfg and not cameras_cfg:
                    for pipeline in self.pipelines.values():
                        pipeline.update_config(
                            staff_count=staff,
                            zone_config=zone_cfg,
                        )

                # Update custom questions
                self._custom_questions = self.config.get("custom_questions", [])

        except Exception as e:
            logger.warning(f"Config sync error: {e}")

    def send_heartbeat(self):
        if time.time() - self.last_heartbeat < HEARTBEAT_INTERVAL:
            return
        try:
            # Build camera status for heartbeat
            cam_status = {}
            for cam_id, pipe in self.pipelines.items():
                cam_status[cam_id] = {
                    "name": pipe.camera_name,
                    "connected": pipe.is_connected,
                }

            queued = self._queue_telemetry(
                "heartbeat",
                HEARTBEAT_URL,
                {
                    "store_id": STORE_ID,
                    "status": "alive",
                    "uptime_cycles": self.total_cycles,
                    "total_uploads": self.total_uploads,
                    "engine_version": "11.2",
                    "yolo_active": True,
                    "bytetrack_active": True,
                    "reid_active": REID_AVAILABLE,
                    "active_cameras": len(self.pipelines),
                    "camera_status": cam_status,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                timeout=10,
            )
            if queued:
                self.last_heartbeat = time.time()
        except Exception as e:
            logger.warning(f"Heartbeat error: {e}")

    def push_snapshot(self):
        """Push a camera frame to API every SNAPSHOT_INTERVAL seconds for zone config."""
        if time.time() - self.last_snapshot < SNAPSHOT_INTERVAL:
            return
        if not self.pipelines:
            return
        try:
            # Use first available camera
            cam_id, pipeline = next(iter(self.pipelines.items()))
            b64 = pipeline.get_snapshot_b64()
            if not b64:
                return
            queued = self._queue_telemetry(
                "snapshot",
                SNAPSHOT_URL,
                {
                    "store_id": STORE_ID,
                    "camera_id": cam_id,
                    "snapshot_b64": b64,
                },
                timeout=15,
                metadata={"camera_id": cam_id},
            )
            if queued:
                self.last_snapshot = time.time()
        except Exception as e:
            logger.warning(f"Snapshot push error: {e}")

    def _reload_local_config(self):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return LOCAL_CONFIG

    def is_store_active(self):
        if time.time() - self.last_config_sync >= CONFIG_SYNC_INTERVAL:
            self.sync_remote_config()
        local_cfg = self._reload_local_config()
        wh = self.config.get("working_hours") or local_cfg.get("working_hours") or {}
        start = wh.get("start", 0)
        end = wh.get("end", 24)
        saudi_hour = (datetime.now(timezone.utc).hour + 3) % 24
        if start < end:
            in_hours = start <= saudi_hour < end
        else:
            in_hours = saudi_hour >= start or saudi_hour < end
        if not in_hours:
            logger.info(f"Outside working hours ({saudi_hour:02d}:00 | range: {start}-{end})")
        return in_hours

    # ── Camera Failure Report ────────────────────────────────────────────────

    def _report_camera_failure(self, reason: str):
        payload = {
            "store_id": STORE_ID,
            "type": "camera_failure",
            "message": reason,
        }
        self._queue_telemetry(
            "camera_failure",
            INGEST_URL,
            payload,
            timeout=15,
            metadata={"message": f"Camera failure reported: {reason}"},
        )

    # ── Push to Cloud ────────────────────────────────────────────────────────

    def push_to_cloud(self, ai_result: dict, tracking_data: dict,
                      question_answers: list):
        """Push analysis result + tracking data to cloud. NO IMAGES."""
        try:
            # tracking_data is now multi-camera format from MultiCameraAggregator
            combined = tracking_data.get('combined', tracking_data)
            window = combined.get('window', {})

            report = {
                "store_id": STORE_ID,
                "score": ai_result.get("score", 0),
                "status": ai_result.get("status", "pass"),
                "summary": ai_result.get("summary", ""),
                "ai_reasoning": ai_result.get("ai_reasoning", ""),
                "confidence_score": ai_result.get("confidence_score", 0),
                "observations": ai_result.get("observations", []),
                "result": {},    # legacy — kept for schema compatibility
                "timestamp": datetime.now(timezone.utc).isoformat(),
                # ── V11.1 Multi-Camera Tracking Data ─────────────────────────
                "tracking_data": tracking_data,
                "question_answers": question_answers,
                # ── No images — text only ────────────────────────────────────
                "annotated_image_b64": None,
                "detections_json": None,
                # ── Daily stats ──────────────────────────────────────────────
                "daily_stats": combined.get('daily_stats', {}),
                # ── Device info ──────────────────────────────────────────────
                "client_environment": {
                    "captured_from": window.get('start', ''),
                    "captured_to": window.get('end', ''),
                    "frames_count": window.get('frames_processed', 0),
                    "device_timezone": time.tzname[0],
                    "engine_version": "11.2",
                    "yolo_active": True,
                    "bytetrack_active": True,
                    "reid_active": REID_AVAILABLE,
                    "subscription_tier": self.config.get("subscription_tier", "unknown"),
                    "active_cameras": tracking_data.get('total_cameras', 1),
                    "multi_camera": tracking_data.get('multi_camera', False),
                },
            }

            return self._queue_telemetry(
                "audit",
                INGEST_URL,
                report,
                timeout=30,
                metadata={
                    "ai_result": ai_result,
                    "score": report["score"],
                    "persons": combined.get('persons', {}),
                    "total_cameras": tracking_data.get('total_cameras', 1),
                    "window_start": window.get('start', ''),
                    "window_end": window.get('end', ''),
                },
            )

            if resp.status_code in (200, 201):
                self.total_uploads += 1
                p = combined.get('persons', {})
                cams = tracking_data.get('total_cameras', 1)
                logger.info(
                    f"Uploaded — score: {report['score']}% | "
                    f"cameras: {cams} | "
                    f"staff: {p.get('unique_staff', 0)} | "
                    f"customers: {p.get('unique_customers', 0)}"
                )
                self._save_analysis_history(
                    ai_result,
                    window.get('start', ''),
                    window.get('end', ''),
                )
                return True
            else:
                logger.error(f"Upload HTTP {resp.status_code}: {resp.text[:200]}")
                self._enqueue_payload(report, "audit")

        except Exception as e:
            logger.error(f"Upload error: {e}")

        return False

    # ── Test Connection ──────────────────────────────────────────────────────

    def _test_api_connection(self):
        logger.info("Testing API connection...")
        try:
            resp = requests.post(
                ANALYZE_URL,
                json={
                    "prompt": "Reply with only: ok",
                    "store_id": STORE_ID,
                },
                headers={"x-api-key": API_KEY, "Content-Type": "application/json"},
                timeout=30,
            )
            if resp.status_code == 200:
                logger.info("Gemini API connected")
                return True
            else:
                logger.error(f"API test HTTP {resp.status_code}")
                return False
        except Exception as e:
            logger.error(f"API test failed: {e}")
            return False

    # =========================================================================
    # MAIN LOOP
    # =========================================================================

    def _build_camera_configs(self) -> list:
        """
        Build camera configuration list from remote + local config.
        Supports both multi-camera (cameras array) and legacy single-camera (rtsp_url).
        Enforces subscription tier limits.
        """
        local_cfg = self._reload_local_config()
        cameras = self.config.get("cameras", [])

        if not cameras:
            # Legacy single-camera fallback
            rtsp_url = self.config.get("rtsp_url") or local_cfg.get("rtsp_url")
            if rtsp_url:
                cameras = [{
                    "camera_id": "camera_01",
                    "name": self.config.get("store_name", "الكاميرا الرئيسية"),
                    "rtsp_url": rtsp_url,
                }]

        # Enforce tier limit
        tier = self.config.get("subscription_tier", "basic").lower()
        max_cams = TIER_MAX_CAMERAS.get(tier, 1)
        if len(cameras) > max_cams:
            logger.warning(
                f"Tier '{tier}' allows {max_cams} cameras, "
                f"but {len(cameras)} configured — truncating"
            )
            cameras = cameras[:max_cams]

        return cameras

    def _get_camera_fps(self, cam_cfg: dict) -> int:
        """
        FPS is determined ONLY by the explicit is_door boolean set by the
        operator in ZoneConfig — never inferred from the camera name.
        Door cameras: 10 FPS (LineZone needs to catch fast crossings).
        Service/waiting cameras: 2 FPS (slow movement, saves CPU).
        """
        is_door = cam_cfg.get("is_door", False) is True
        return DOOR_CAMERA_FPS if is_door else SERVICE_CAMERA_FPS

    def _check_hardware(self, num_cameras: int):
        """Warn if hardware may be insufficient for the camera count."""
        try:
            import psutil
            cpu_count = psutil.cpu_count(logical=False) or 2
            ram_gb = psutil.virtual_memory().total / (1024 ** 3)
            # Rule of thumb: 2 physical cores + 2GB RAM per camera
            min_cores = num_cameras * 2
            min_ram = num_cameras * 2.0
            if cpu_count < min_cores or ram_gb < min_ram:
                logger.warning(
                    f"⚠️  Hardware warning: {num_cameras} cameras require "
                    f"~{min_cores} CPU cores & {min_ram:.0f}GB RAM. "
                    f"Detected: {cpu_count} cores, {ram_gb:.1f}GB RAM. "
                    f"Performance may be degraded."
                )
        except ImportError:
            pass  # psutil not available

    def _spawn_pipelines(self, camera_configs: list):
        """Create or update CameraPipeline instances from config."""
        staff = int(self.config.get("staff_count", 0) or
                    self._reload_local_config().get("staff_count", 0))
        zone_configs = self.config.get("zone_configs", {})

        self._check_hardware(len(camera_configs))

        active_ids = set()

        for cam_cfg in camera_configs:
            cam_id = cam_cfg.get("camera_id", f"camera_{len(active_ids)+1:02d}")
            cam_name = cam_cfg.get("name", cam_id)
            rtsp_url = cam_cfg.get("rtsp_url")
            cam_zone = zone_configs.get(cam_id) or cam_cfg.get("zone_config")
            cam_fps = self._get_camera_fps(cam_cfg)

            if not rtsp_url:
                logger.warning(f"Camera {cam_id} has no RTSP URL — skipping")
                continue

            active_ids.add(cam_id)

            if cam_id in self.pipelines:
                self.pipelines[cam_id].update_config(
                    staff_count=staff,
                    zone_config=cam_zone,
                    rtsp_url=rtsp_url,
                )
            else:
                pipeline = CameraPipeline(
                    camera_id=cam_id,
                    camera_name=cam_name,
                    rtsp_url=rtsp_url,
                    staff_count=staff,
                    zone_config=cam_zone,
                    yolo_model=self._shared_yolo,
                    fps=cam_fps,
                )
                pipeline.start()
                logger.info(f"📹 [{cam_id}] FPS={cam_fps} ({'door' if cam_fps == DOOR_CAMERA_FPS else 'service'})")
                self.pipelines[cam_id] = pipeline

        removed = set(self.pipelines.keys()) - active_ids
        for cam_id in removed:
            logger.info(f"Camera {cam_id} removed from config — stopping pipeline")
            self.pipelines[cam_id].stop()
            del self.pipelines[cam_id]

    def run(self):
        logger.info("=" * 60)
        logger.info("SplitTech Engine V11.1 — Multi-Camera")
        logger.info("ByteTrack + ReID + Zone Analytics + Text-Only Gemini")
        logger.info(f"   YOLO:      YOLOv8n (shared)")
        logger.info(f"   ByteTrack: supervision (per-camera)")
        logger.info(f"   ReID:      {'osnet_x0_25 (CPU)' if REID_AVAILABLE else 'DISABLED'}")
        logger.info(f"   FPS:       {TARGET_FPS}")
        logger.info(f"   Window:    {AGGREGATION_WINDOW}s")
        logger.info(f"   Heartbeat: {HEARTBEAT_INTERVAL}s")
        logger.info("=" * 60)

        # Initial config sync
        self.sync_remote_config()
        self._custom_questions = self.config.get("custom_questions", [])
        self._test_api_connection()

        # ── Build & spawn camera pipelines ───────────────────────────────
        camera_configs = self._build_camera_configs()
        if not camera_configs:
            logger.error("No cameras configured — exiting")
            return

        tier = self.config.get("subscription_tier", "basic")
        max_cams = TIER_MAX_CAMERAS.get(tier.lower(), 1)
        logger.info(
            f"Tier: {tier} | Max cameras: {max_cams} | "
            f"Configured: {len(camera_configs)}"
        )

        self._spawn_pipelines(camera_configs)

        # ── Main orchestrator loop ───────────────────────────────────────
        last_window_check = time.time()
        WINDOW_CHECK_INTERVAL = 30  # check for completed windows every 30s

        while self.running:
            try:
                # ── Heartbeat ────────────────────────────────────────────
                self.send_heartbeat()
                self.push_snapshot()

                # ── Working hours check ──────────────────────────────────
                if not self.is_store_active():
                    time.sleep(30)
                    continue

                # ── Camera failure detection ─────────────────────────────
                for cam_id, pipeline in list(self.pipelines.items()):
                    if (pipeline.rtsp_reader.consecutive_failures >=
                            MAX_CONSECUTIVE_FAILURES):
                        self._report_camera_failure(
                            f"Camera {cam_id} ({pipeline.camera_name}) "
                            f"failed {pipeline.rtsp_reader.consecutive_failures} times"
                        )

                # ── Collect completed 10-min windows from all cameras ────
                now = time.time()
                if now - last_window_check >= WINDOW_CHECK_INTERVAL:
                    last_window_check = now

                    camera_payloads = {}
                    for cam_id, pipeline in self.pipelines.items():
                        payload = pipeline.get_latest_payload()
                        if payload:
                            camera_payloads[cam_id] = payload

                    if camera_payloads:
                        self.total_cycles += 1
                        logger.info(f"\n{'=' * 55}")
                        logger.info(
                            f"Cycle #{self.total_cycles} | "
                            f"{len(camera_payloads)}/{len(self.pipelines)} "
                            f"cameras reported"
                        )

                        # Sync config & check active
                        self.sync_remote_config()
                        if not self.config.get("is_active", True):
                            logger.info(f"Store inactive: {self.config.get('reason')}")
                            time.sleep(30)
                            continue

                        # Hot-update pipelines if config changed
                        new_configs = self._build_camera_configs()
                        if new_configs:
                            self._spawn_pipelines(new_configs)

                        # ── Merge multi-camera data ──────────────────────
                        merged = self.multi_camera_aggregator.merge(
                            camera_payloads)
                        combined = merged.get('combined', {})

                        # ── Daily stats (from combined) ──────────────────
                        daily_summary = combined.get('daily_stats', {})

                        # ── Answer custom questions ──────────────────────
                        questions = (self._custom_questions or
                                     self.config.get("custom_questions", []))
                        question_answers = self.question_answerer.answer_questions(
                            questions, combined, daily_summary)

                        # ── Gemini cross-camera analysis ─────────────────
                        ai_result = self.gemini.analyze(
                            merged, question_answers, self.config)

                        if ai_result:
                            logger.info(
                                f"Score: {ai_result.get('score')}% | "
                                f"Status: {ai_result.get('status')}"
                            )
                            self.push_to_cloud(
                                ai_result, merged, question_answers)
                        else:
                            logger.error("Analysis returned no result")

                        gc.collect()

                # Sleep to prevent CPU spin
                time.sleep(1)

            except Exception as e:
                logger.error(f"Orchestrator error: {e}", exc_info=True)
                time.sleep(5)

        # ── Cleanup ──────────────────────────────────────────────────────
        for cam_id, pipeline in self.pipelines.items():
            pipeline.stop()
        self._telemetry_stop.set()
        self._telemetry_thread.join(timeout=10)
        logger.info("Engine stopped gracefully.")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    engine = SplitTechEngineV11()
    engine.run()
