import { ArrowUpRight } from "lucide-react";
import { products } from "@/lib/siteData";

export default function MerchDrop() {
  return (
    <div className="shop-page">
      <section className="shop-hero">
        <div className="shop-pattern" />
        <div className="page-shell shop-hero-inner">
          <p className="eyebrow">OFFICIAL FAZE MERCHANDISE / LIVE STORE LINKS</p>
          <h1>THE<br /><em>DROP.</em></h1>
          <div><p>Built for the server, the arena and everywhere after.</p><a className="button primary" href="https://fazeclan.com/collections" target="_blank" rel="noreferrer">Shop all collections <ArrowUpRight /></a></div>
        </div>
      </section>
      <div className="shop-index"><span>01 / LATEST</span><span>02 / ESPORTS</span><span>03 / ACCESSORIES</span><span>OFFICIAL STORE ↗</span></div>
      <div className="page-shell">
        <section className="shop-lead reveal">
          <p className="eyebrow red">CURRENT SELECTION</p>
          <h2>WEAR THE<br />NEXT <em>FAZE.</em></h2>
          <p>Official products, availability and pricing are linked directly to FaZeClan.com. Availability can change at any time.</p>
        </section>
        <section className="product-grid">
          {products.map((product, index) => (
            <a className={`product-card ${index === 0 ? "product-featured" : ""}`} href={product.href} target="_blank" rel="noreferrer" key={product.name}>
              <div className="product-image"><img src={product.image} alt={product.imageAlt}/><span className={product.status === "AVAILABLE" ? "available" : "sold-out"}>{product.status}</span></div>
              <div className="product-meta"><span>{String(index + 1).padStart(2,"0")}</span><h3>{product.name}</h3><strong>{product.price}</strong><ArrowUpRight /></div>
            </a>
          ))}
        </section>
        <section className="shop-collections reveal">
          <p className="eyebrow">SHOP BY COLLECTION</p>
          {[
            ["FAZE ESPORTS","https://fazeclan.com/collections/faze-esports"],
            ["FAZE ESSENTIALS","https://fazeclan.com/collections/faze-essentials"],
            ["THE BUNKER","https://fazeclan.com/collections/the-bunker"],
            ["ALL PRODUCTS","https://fazeclan.com/collections/all"],
          ].map(([name,href],i)=><a href={href} target="_blank" rel="noreferrer" key={name}><span>0{i+1}</span><h2>{name}</h2><ArrowUpRight /></a>)}
        </section>
      </div>
    </div>
  );
}
