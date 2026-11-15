"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Upload, X } from "lucide-react";
type Draft = {
  handle: string;
  url: string;
  channel: string;
  caption: string;
  savedAt?: string;
};
export function SubmissionForm({
  slug,
  accepting = true,
}: {
  slug: string;
  accepting?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    handle: "",
    url: "",
    channel: "",
    caption: "",
  });
  const [mode, setMode] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const key = `faze-entry-draft:${slug}`;
  useEffect(() => {
    try {
      const d = localStorage.getItem(key);
      if (d) {
        const value = JSON.parse(d);
        setDraft(value);
        if (value.url) setMode("url");
      }
    } catch {
      /* A blocked storage area should not prevent creating a preview. */
    }
  }, [key]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function update(field: keyof Draft, value: string) {
    setSaved(false);
    setDraft((d) => ({ ...d, [field]: value }));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (mode === "file" && !file) {
      setMessage("Choose a gameplay video to preview your entry.");
      return;
    }
    if (!consent) {
      setMessage("Confirm that you own this clip before saving your draft.");
      return;
    }
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...draft,
          url: mode === "url" ? draft.url : "",
          savedAt: new Date().toISOString(),
        }),
      );
      setSaved(true);
      setMessage(
        file
          ? "Draft saved on this browser. Your video is preview-only and needs to be reselected after a refresh. Nothing has been uploaded."
          : "Draft saved on this browser. Nothing has been submitted to FaZe.",
      );
    } catch {
      setMessage(
        "Browser storage is unavailable. Your preview is still here, but the draft could not be saved.",
      );
    }
  }
  return (
    <section id="submit" className="submission-section">
      <div className="submission-invitation">
        <div>
          <p className="eyebrow red">
            DON’T JUST WATCH THE NEXT GENERATION. BE IT.
          </p>
          <h2>
            MAKE THE
            <br />
            NEXT <em>CUT.</em>
          </h2>
          <p>
            Recreate the Temperrr Shot for a chance to have your clip and
            creator handle featured in a community montage.
          </p>
          {!accepting && (
            <p className="subtle-note">
              This campaign is past its submission window. You can still prepare
              a local draft for your next entry.
            </p>
          )}
        </div>
        <button
          className="button primary"
          aria-expanded={expanded}
          aria-controls="entry-form"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Close your draft" : "Post your recreation"}
          {expanded ? <X size={20} /> : <ArrowRight size={20} />}
        </button>
      </div>
      {expanded && (
        <form
          id="entry-form"
          ref={form}
          onSubmit={submit}
          className="entry-form"
        >
          <div className="entry-fields">
            <p className="eyebrow">01 / YOUR CLIP</p>
            <div className="input-tabs">
              <button
                type="button"
                aria-pressed={mode === "file"}
                onClick={() => {
                  setMode("file");
                  setSaved(false);
                }}
              >
                Upload a file
              </button>
              <button
                type="button"
                aria-pressed={mode === "url"}
                onClick={() => {
                  setMode("url");
                  setSaved(false);
                }}
              >
                Use a clip link
              </button>
            </div>
            {mode === "file" ? (
              <label className="file-input">
                <Upload size={24} />
                <strong>{file?.name ?? "Choose your gameplay clip"}</strong>
                <span>MP4 or WebM · up to 100 MB</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (
                      f &&
                      (f.size > 100 * 1024 * 1024 ||
                        !["video/mp4", "video/webm"].includes(f.type))
                    ) {
                      setMessage("Choose an MP4 or WebM under 100 MB.");
                      e.target.value = "";
                      return;
                    }
                    setFile(f ?? null);
                    setSaved(false);
                    setMessage("");
                  }}
                />
              </label>
            ) : (
              <label>
                Clip URL
                <input
                  type="url"
                  required
                  value={draft.url}
                  placeholder="https://youtube.com/watch?v=…"
                  onChange={(e) => update("url", e.target.value)}
                />
              </label>
            )}
            <div className="input-row">
              <label>
                Creator handle
                <input
                  required
                  maxLength={40}
                  value={draft.handle}
                  placeholder="@yourhandle"
                  onChange={(e) => update("handle", e.target.value)}
                />
              </label>
              <label>
                Creator channel (optional)
                <input
                  type="url"
                  value={draft.channel}
                  placeholder="https://twitch.tv/…"
                  onChange={(e) => update("channel", e.target.value)}
                />
              </label>
            </div>
            <label>
              Your caption (optional)
              <textarea
                rows={3}
                maxLength={240}
                value={draft.caption}
                placeholder="The story behind your shot…"
                onChange={(e) => update("caption", e.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              <span>I own this clip and the credit above is correct.</span>
            </label>
            <button className="button dark" type="submit">
              {saved ? "Draft saved" : "Save my entry draft"}
              {saved ? <Check size={18} /> : <ArrowRight size={18} />}
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                try {
                  localStorage.removeItem(key);
                } catch {}
                setDraft({ handle: "", url: "", channel: "", caption: "" });
                setFile(null);
                setConsent(false);
                setSaved(false);
                form.current?.reset();
                setMessage("Your local draft has been cleared.");
              }}
            >
              Discard local draft <X size={14} />
            </button>
            <p className="subtle-note">
              Local preview only. Submission delivery will be enabled when the
              upload service is connected. No public gallery entry is created.
            </p>
            <p role="status" className="form-message">
              {message}
            </p>
          </div>
          <div className="entry-preview">
            <p className="eyebrow">02 / YOUR PREVIEW</p>
            {preview && mode === "file" ? (
              <video
                src={preview}
                controls
                playsInline
                className="draft-video"
                aria-label="Your entry preview"
              />
            ) : (
              <div className="draft-empty">
                <Upload size={32} />
                <p>
                  {mode === "url"
                    ? "Your link is saved with the draft. Upload a file for an instant playable preview."
                    : "Your clip goes here."}
                </p>
              </div>
            )}
            <h3>{draft.handle || "@yourhandle"}</h3>
            <p>{draft.caption || "Your play. Your name. Your next chapter."}</p>
            <span className="status-tag">PRIVATE DRAFT / NOT SUBMITTED</span>
          </div>
        </form>
      )}
    </section>
  );
}
