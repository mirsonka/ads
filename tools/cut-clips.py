"""Нарезка зацикленных отрезков для мониторов в бегущей ленте (monitor-1…6).

Берёт скачанное видео, находит склейки кадров и выбирает 5-секундные окна целиком
внутри одного плана — без единой склейки, поэтому в отрезке гарантированно один
и тот же фрагмент рекламы. Окна разнесены по всему видео, чтобы отрезки были
из разных роликов. Каждый отрезок кодируется в WebM (VP9) и MP4 (H.264) без звука,
рядом кладётся полоска контрольных кадров (по кадру в секунду) — проверить глазами,
что это реклама, а не заставка. В конце пути вписываются в scripts/tv-videos.js.

Если 5-секундных планов меньше, чем мониторов, недостающие отрезки берутся из планов
покороче, но не короче --min-length (3 с): отрезок занимает весь план без отступов
у склеек.

Нужны пакеты: pip install imageio-ffmpeg

    python tools/cut-clips.py путь/к/видео.mp4
    python tools/cut-clips.py видео.mp4 --skip 9.4          # пропустить начало
    python tools/cut-clips.py видео.mp4 --starts 12,47.5,80  # свои начала отрезков
    python tools/cut-clips.py видео.mp4 --min-length 2.5     # добирать и короче
    python tools/cut-clips.py видео.mp4 --clips 0:00-0:04,1:07-1:12  # свои отрезки
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def ffmpeg(*args, capture=False):
    result = subprocess.run(
        [FFMPEG, "-hide_banner", "-y", *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode:
        sys.exit(f"ffmpeg завершился с ошибкой:\n{result.stderr[-2000:]}")
    return result.stderr if capture else None


def duration(video):
    # ffmpeg без выходного файла выходит с ошибкой, но длительность успевает напечатать
    info = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(video)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stderr
    match = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    if not match:
        sys.exit(f"Не удалось прочитать длительность {video}")
    h, m, s = match.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def cuts(video, threshold):
    """Моменты склеек: кадры, которые сильно отличаются от предыдущего."""
    log = ffmpeg(
        "-i", str(video),
        "-an",
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-f", "null", "-",
        capture=True,
    )
    return [float(t) for t in re.findall(r"pts_time:([\d.]+)", log)]


def pick(shots, count, length, shortest, margin, gap):
    """Отрезки [(начало, длина)]. Сначала полной длины: по одному на каждую из count
    равных частей видео — самый длинный подходящий план в ней; соседние отрезки
    не ближе gap секунд, чтобы не взять два плана одного ролика. Недостающие
    добираются самыми длинными из оставшихся планов — сперва с тем же ограничением,
    потом без него, — а если и их не хватает, планами покороче, от shortest секунд:
    такой отрезок занимает весь план, кроме отступов у склеек."""
    usable = [(a + margin, b - margin) for a, b in shots if b - a - 2 * margin >= shortest]
    if not usable:
        return []

    full = [s for s in usable if s[1] - s[0] >= length]
    chosen = []

    def free(shot, apart):
        return all(abs(shot[0] - start) >= apart for start, _ in chosen)

    def take(shot):
        chosen.append((shot[0], min(length, shot[1] - shot[0])))

    if full:
        first, last = full[0][0], full[-1][1]
        part = (last - first) / count
        for i in range(count):
            lo, hi = first + i * part, first + (i + 1) * part
            inside = [s for s in full if lo <= s[0] < hi and free(s, gap)]
            if inside:
                take(max(inside, key=lambda s: s[1] - s[0]))

    # самые длинные первыми: из полных планов, потом из коротких
    for pool in (full, usable):
        for apart in (gap, 0.01):
            for shot in sorted(pool, key=lambda s: s[0] - s[1]):
                if len(chosen) >= count:
                    break
                if free(shot, apart):
                    take(shot)

    return sorted(chosen)


def export(video, start, length, out, width):
    common = ["-ss", f"{start:.3f}", "-t", f"{length}", "-i", str(video), "-an",
              "-vf", f"scale={width}:-2"]
    ffmpeg(*common, "-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0",
           "-row-mt", "1", f"{out}.webm")
    ffmpeg(*common, "-c:v", "libx264", "-crf", "27", "-preset", "slow",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", f"{out}.mp4")
    ffmpeg("-ss", f"{start:.3f}", "-t", f"{length}", "-i", str(video),
           "-vf", f"fps=1,scale=240:-2,tile={max(1, int(length))}x1",
           "-frames:v", "1", f"{out}-frames.png")


def seconds(value):
    """«1:07», «0:04.5» или «67» — в секунды."""
    total = 0.0
    for part in value.strip().split(":"):
        total = total * 60 + float(part)
    return total


def update_config(config, names):
    text = config.read_text(encoding="utf-8")
    for i, name in enumerate(names, 1):
        paths = f"['assets/video/{name}.webm', 'assets/video/{name}.mp4']"
        text, found = re.subn(
            rf"'monitor-{i}':[^\n]*,", f"'monitor-{i}': {paths},", text
        )
        if not found:
            print(f"  в {config.name} нет слота monitor-{i} — пропущен")
    config.write_text(text, encoding="utf-8")


def main():
    # консоль Windows по умолчанию не в UTF-8 — русский текст печатался бы кракозябрами
    sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("video", type=Path)
    parser.add_argument("--count", type=int, default=6)
    parser.add_argument("--length", type=float, default=5)
    parser.add_argument("--min-length", type=float, default=3,
                        help="самый короткий отрезок, если полных не хватает, с")
    parser.add_argument("--skip", type=float, default=0, help="пропустить начало, с")
    parser.add_argument("--starts", help="свои начала отрезков через запятую, с")
    parser.add_argument("--clips",
                        help="свои отрезки «начало-конец» через запятую, м:сс или с")
    parser.add_argument("--threshold", type=float, default=0.3,
                        help="чувствительность к склейкам, 0…1 (меньше — строже)")
    parser.add_argument("--width", type=int, default=480)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "assets/video")
    parser.add_argument("--config", type=Path, default=ROOT / "scripts/tv-videos.js")
    parser.add_argument("--name", default="ad", help="префикс имён файлов")
    args = parser.parse_args()

    if not args.video.is_file():
        sys.exit(f"Нет файла {args.video}")

    total = duration(args.video)
    found = [t for t in cuts(args.video, args.threshold) if t > args.skip]
    edges = [args.skip, *found, total]
    shots = list(zip(edges, edges[1:]))
    print(f"Видео {total:.1f} с, склеек после {args.skip} с: {len(found)}, "
          f"планов: {len(shots)}")

    if args.clips or args.starts:
        if args.clips:
            ranges = [r.split("-") for r in args.clips.split(",")]
            clips = [(seconds(a), seconds(b) - seconds(a)) for a, b in ranges]
        else:
            clips = [(seconds(s), args.length) for s in args.starts.split(",")]
        for start, length in clips:
            inside = [c for c in found if start < c < start + length]
            if inside:
                print(f"  внимание: в отрезке с {start} с есть склейки на {inside}")
    else:
        # отступ от склеек — на случай, если склейка найдена на кадр позже
        clips = pick(shots, args.count, args.length, args.min_length,
                     margin=0.3, gap=args.length + 3)

    manual = bool(args.clips or args.starts)
    short = [c for c in clips if c[1] < args.length]
    if short and not manual:
        print(f"Планов от {args.length} с не хватило, отрезков короче: {len(short)} "
              f"(не короче {args.min_length} с).")
    if len(clips) < args.count and not manual:
        print(f"Нашлось только {len(clips)} планов от {args.min_length} с. "
              f"Попробуйте --min-length меньше, --threshold больше или --starts.")
    if not clips:
        sys.exit(1)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    names = []
    for i, (start, length) in enumerate(clips[: args.count], 1):
        name = f"{args.name}-{i}"
        print(f"  {name}: {start:.2f}–{start + length:.2f} с ({length:.1f} с)")
        export(args.video, start, length, args.out_dir / name, args.width)
        names.append(name)

    update_config(args.config, names)
    print(f"Готово: {args.out_dir}, пути вписаны в {args.config.name}. "
          f"Проверьте контрольные кадры *-frames.png и удалите их после проверки.")


if __name__ == "__main__":
    main()
