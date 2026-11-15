"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
export type PlayerHandle = { video: HTMLVideoElement | null };
export const HlsPlayer = forwardRef<
  PlayerHandle,
  {
    src: string | null;
    poster?: string;
    className?: string;
    autoPlay?: boolean;
    loop?: boolean;
    onEnded?: () => void;
    label?: string;
  }
>(function HlsPlayer(
  { src, poster, className, autoPlay, loop, onEnded, label },
  ref,
) {
  const v = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useImperativeHandle(ref, () => ({ video: v.current }));
  useEffect(() => {
    const el = v.current;
    if (!el || !src) return;
    let disposed = false;
    let hls: import("hls.js").default | undefined;
    setFailed(false);
    if (
      !/\.m3u8(?:\?|$)/i.test(src) ||
      el.canPlayType("application/vnd.apple.mpegurl")
    )
      el.src = src;
    else
      import("hls.js")
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(el);
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) setFailed(true);
            });
          } else setFailed(true);
        })
        .catch(() => setFailed(true));
    return () => {
      disposed = true;
      hls?.destroy();
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [src]);
  useEffect(() => {
    if (autoPlay) v.current?.play().catch(() => {});
  }, [autoPlay]);
  return (
    <>
      <video
        ref={v}
        poster={poster}
        aria-label={label}
        className={className}
        controls
        playsInline
        muted
        autoPlay={autoPlay}
        loop={loop}
        preload="metadata"
        onPlay={() =>
          document.querySelectorAll("video").forEach((el) => {
            if (el !== v.current) el.pause();
          })
        }
        onError={() => setFailed(true)}
        onEnded={onEnded}
      />
      {failed && (
        <p className="playback-error" role="status">
          This clip could not load. Try again when the media service is
          available.
        </p>
      )}
    </>
  );
});
