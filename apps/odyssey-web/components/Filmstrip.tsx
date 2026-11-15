import Link from "next/link";
import { Plus, ArrowUpRight } from "lucide-react";
import { campaignHref } from "@/lib/content";
export function Filmstrip() {
  return (
    <div className="filmstrip">
      <div className="filmstrip-caption">
        <span>THE HOMECOMING SEASON</span>
        <span>FOUR CHAPTERS. YOUR NEXT MOVE.</span>
      </div>
      <div className="filmstrip-frames">
        <Link href={campaignHref}>
          <img src="/media/rooftop.jpg" alt="Illustrative rooftop gameplay" />
          <span>
            <b>01</b> RECREATE THE SHOT <ArrowUpRight size={14} />
          </span>
        </Link>
        <Link href="/make-the-cut#upcoming">
          <img src="/media/antwerp.jpg" alt="Illustrative esports arena" />
          <span>
            <b>02</b> CALL THE PLAY <ArrowUpRight size={14} />
          </span>
        </Link>
        <Link href="/make-the-cut#upcoming">
          <img
            src="/media/nightshift.jpg"
            alt="Illustrative editing challenge"
          />
          <span>
            <b>03</b> EDITOR RELAY <ArrowUpRight size={14} />
          </span>
        </Link>
        <Link href={`${campaignHref}#submit`} className="empty-frame">
          <Plus size={32} strokeWidth={1} />
          <span>
            <b>04</b> YOUR NAME HERE <ArrowUpRight size={14} />
          </span>
        </Link>
      </div>
    </div>
  );
}
