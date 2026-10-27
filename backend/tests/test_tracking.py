"""ReID 跟踪集成测试：真实人脸合成多目标运动序列，验证轨迹 ID 稳定。"""
import cv2
import numpy as np

from app.core.security import read_encrypted_file
from app.ai.detector import detector
from app.ai.tracker import FaceTracker


def load_face_crop() -> np.ndarray:
    raw = read_encrypted_file("faces/bdcd8c72006f47588511410ddedc49fd.jpg")
    arr = np.frombuffer(raw, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    boxes = detector().detect(img)
    assert boxes, "检测器未在底库照片中检测到人脸"
    b = boxes[0]
    h, w = img.shape[:2]
    m = 0.3
    fx1 = max(0, int(b.x1 - (b.x2 - b.x1) * m))
    fy1 = max(0, int(b.y1 - (b.y2 - b.y1) * m))
    fx2 = min(w, int(b.x2 + (b.x2 - b.x1) * m))
    fy2 = min(h, int(b.y2 + (b.y2 - b.y1) * m))
    return cv2.resize(img[fy1:fy2, fx1:fx2], (100, 120))


def run_lanes_test(crop):
    """3 张同源人脸在 3 条水平车道匀速移动 15 帧，应得到 3 个稳定 ID。"""
    W, H = 640, 480
    fh, fw = crop.shape[:2]
    lanes = [(30, 20), (30, 180), (30, 340)]  # (start_x, y)
    tracker = FaceTracker(min_hits=1)
    lane_ids = {0: [], 1: [], 2: []}

    for i in range(15):
        canvas = np.full((H, W, 3), 40, np.uint8)
        for lane, (sx, sy) in enumerate(lanes):
            x = sx + i * 10
            if x + fw < W:
                canvas[sy:sy + fh, x:x + fw] = crop
        snap = tracker.update(canvas)
        for t in snap:
            cy = t["center"][1]
            nearest = min(range(3), key=lambda k: abs(cy - (lanes[k][1] + fh // 2)))
            lane_ids[nearest].append(t["id"])

    print("summary:", tracker.summary())
    for lane in range(3):
        uniq = sorted(set(lane_ids[lane]))
        print(f"  lane {lane}: distinct ids={uniq}, frames={len(lane_ids[lane])}")
        assert len(uniq) == 1, f"lane {lane} 出现 ID 漂移: {uniq}"
    print("PASS: 3 条轨迹 ID 在 15 帧内稳定")


def run_crossing_test(crop):
    """2 张同源人脸交叉移动，观察（非断言）交叉时的 ID 保持情况。"""
    W, H = 640, 480
    fh, fw = crop.shape[:2]
    tracker = FaceTracker(min_hits=1)
    top_id = None
    bot_id = None
    for i in range(20):
        canvas = np.full((H, W, 3), 40, np.uint8)
        # 上车道从左到右，下车道从右到左，中段交叉
        tx = 40 + i * 25
        bx = W - fw - 40 - i * 25
        canvas[40:40 + fh, tx:tx + fw] = crop
        canvas[280:280 + fh, bx:bx + fw] = crop
        snap = tracker.update(canvas)
        for t in snap:
            cy = t["center"][1]
            if cy < 160:
                if top_id is None:
                    top_id = t["id"]
            else:
                if bot_id is None:
                    bot_id = t["id"]
    print(f"  crossing: top lane first id={top_id}, bottom lane first id={bot_id}")
    print("  (同源人脸交叉时，因特征相同，是否换 ID 取决于 IoU 关联；真实不同人脸由 ReID 区分)")


if __name__ == "__main__":
    crop = load_face_crop()
    print(f"人脸裁剪尺寸: {crop.shape}")
    run_lanes_test(crop)
    run_crossing_test(crop)
    print("ALL INTEGRATION TESTS DONE")
