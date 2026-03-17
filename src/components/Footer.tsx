import { Link } from "react-router-dom";

const LOGO_URL = "https://cdn.vinfreak.com/branding/VCzgNThhX13rCP1Yu8pTwg.png";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card mt-12">
      <div className="container py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <Link to="/" className="inline-block">
              <img src={LOGO_URL} alt="VINFREAK" className="h-10 w-auto object-contain" />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              AI-powered exotic car search across auctions, dealers, and marketplaces worldwide.
            </p>
          </div>

          {/* Browse */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">Browse</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/?sort=relevance" className="text-muted-foreground hover:text-primary transition-colors">Recommended</Link></li>
              <li><Link to="/?saleType=auction" className="text-muted-foreground hover:text-primary transition-colors">Auctions</Link></li>
              <li><Link to="/?sort=recent" className="text-muted-foreground hover:text-primary transition-colors">New Listings</Link></li>
              <li><Link to="/?sort=end_time_asc" className="text-muted-foreground hover:text-primary transition-colors">Ending Soonest</Link></li>
            </ul>
          </div>

          {/* Popular Makes */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">Popular Makes</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/?make=Porsche" className="text-muted-foreground hover:text-primary transition-colors">Porsche</Link></li>
              <li><Link to="/?make=Ferrari" className="text-muted-foreground hover:text-primary transition-colors">Ferrari</Link></li>
              <li><Link to="/?make=Lamborghini" className="text-muted-foreground hover:text-primary transition-colors">Lamborghini</Link></li>
              <li><Link to="/?make=BMW" className="text-muted-foreground hover:text-primary transition-colors">BMW</Link></li>
            </ul>
          </div>

          {/* Sources */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-foreground">Sources</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/?source=carsandbids" className="text-muted-foreground hover:text-primary transition-colors">Cars & Bids</Link></li>
              <li><Link to="/?source=bringatrailer" className="text-muted-foreground hover:text-primary transition-colors">Bring a Trailer</Link></li>
              <li><Link to="/?source=facebook_marketplace" className="text-muted-foreground hover:text-primary transition-colors">FB Marketplace</Link></li>
              <li><Link to="/?source=pca" className="text-muted-foreground hover:text-primary transition-colors">PCA Mart</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {year} VINFREAK. All rights reserved.</p>
          <p>Built with passion for car enthusiasts.</p>
        </div>
      </div>
    </footer>
  );
}
