"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type PlayerHandle = { video: HTMLVideoElement | null };

export const HlsPlayer = forwardRef<PlayerHandle, { src: string | null; poster?: string; className?: string; autoPlay?: boolean; onEnded?: () => void; label?: string }>(
  function HlsPlayer({ src, className, autoPlay, onEnded, label }, ref) {
    const v = useRef<HTMLVideoElement>(null);
    useImperativeHandle(ref, () => ({ video: v.current }));
    useEffect(() => {
      const el = v.current; if (!el || !src) return;
      let hls: any;
      if (el.canPlayType("application/vnd.apple.mpegurl")) { el.src = src; }
      else import("hls.js").then(({ default: Hls }) => { if (Hls.isSupported()) { hls = new Hls(); hls.loadSource(src); hls.attachMedia(el); } });
      return () => hls?.destroy();
    }, [src]);
    return (
      <video ref={v} aria-label={label} className={className} controls playsInline muted autoPlay={autoPlay} onEnded={onEnded} />
    );
  });
