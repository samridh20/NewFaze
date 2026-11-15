"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Play, ArrowUpRight } from "lucide-react";
import { HlsPlayer } from "./HlsPlayer";
export function MediaFrame({
  poster,
  src,
  youtube,
  title,
  caption,
  loop = false,
}: {
  poster: string;
  src?: string | null;
  youtube?: string;
  title: string;
  caption?: string;
  loop?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const mediaId = useId();
  useEffect(() => {
    const stopOther = (event: Event) => {
      if ((event as CustomEvent).detail !== mediaId) setPlaying(false);
    };
    const stopForVideo = () => setPlaying(false);
    window.addEventListener("faze-media-play", stopOther);
    document.addEventListener("play", stopForVideo, true);
    return () => {
      window.removeEventListener("faze-media-play", stopOther);
      document.removeEventListener("play", stopForVideo, true);
    };
  }, [mediaId]);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setPlaying(false);
  }, [src, youtube]);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          el.querySelector("video")?.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <figure className="media-figure">
      <div className="media-frame" ref={frame}>
        {playing && youtube && !src ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : src ? (
          <HlsPlayer
            src={src}
            poster={poster}
            loop={loop}
            label={title}
            className="media-video"
          />
        ) : (
          <img src={poster} alt={title} loading="lazy" />
        )}
        {!src &&
          !playing &&
          (youtube ? (
            <button
              className="play-overlay"
              onClick={() => {
                document.querySelectorAll("video").forEach((v) => v.pause());
                window.dispatchEvent(
                  new CustomEvent("faze-media-play", { detail: mediaId }),
                );
                setPlaying(true);
              }}
              aria-label={`Play ${title}`}
            >
              <span>
                <Play fill="currentColor" size={24} />
              </span>
            </button>
          ) : (
            <div className="media-placeholder">
              <span>CAMPAIGN FOOTAGE</span>
              <p>Clip coming soon</p>
              <small>Concept artwork · video placeholder</small>
            </div>
          ))}
        <span className="media-corner">
          {youtube || src ? "PRESS PLAY / GET INTO IT" : "PREVIEW FRAME"}
        </span>
      </div>
      {caption && (
        <figcaption>
          {caption}
          {youtube && (
            <a
              href={`https://www.youtube.com/watch?v=${youtube}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch on YouTube <ArrowUpRight size={13} />
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}
