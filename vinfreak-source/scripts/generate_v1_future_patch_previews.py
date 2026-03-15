from pathlib import Path


OUT_DIR = Path("docs/v2/previews")
OUT_DIR.mkdir(parents=True, exist_ok=True)


class PhotoMaker:
    def __init__(self) -> None:
        self.counter = 0

    def block(self, x: int, y: int, w: int, h: int, variant: str) -> str:
        self.counter += 1
        clip_id = f"clip-photo-{self.counter}"
        if variant == "a":
            grad_id = "photo-sky-a"
            accent = "#8ef0ff"
        elif variant == "b":
            grad_id = "photo-sky-b"
            accent = "#6ea8ff"
        else:
            grad_id = "photo-sky-c"
            accent = "#7ad9ff"
        scale_x = w / 100.0
        scale_y = h / 60.0
        return f"""
  <clipPath id="{clip_id}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12"/></clipPath>
  <g clip-path="url(#{clip_id})">
    <g transform="translate({x},{y}) scale({scale_x:.4f},{scale_y:.4f})">
      <rect x="0" y="0" width="100" height="60" rx="8" fill="url(#{grad_id})"/>
      <rect x="0" y="34" width="100" height="26" fill="rgba(11,16,32,0.7)"/>
      <path d="M8,38 L20,30 L38,28 L55,30 L70,34 L86,34 L92,38 L92,44 L8,44 Z" fill="rgba(12,18,38,0.92)"/>
      <path d="M26,30 L36,22 L54,22 L64,30 Z" fill="rgba(20,32,60,0.9)"/>
      <path d="M12,36 L40,32 L68,32 L88,36" stroke="{accent}" stroke-width="1.2" fill="none"/>
      <circle cx="30" cy="44" r="6" fill="#0b1020" stroke="{accent}" stroke-width="1"/>
      <circle cx="70" cy="44" r="6" fill="#0b1020" stroke="{accent}" stroke-width="1"/>
    </g>
    <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#photo-sheen)" opacity="0.35"/>
  </g>
"""


def svg_doc(width: int, height: int, content: str) -> str:
    defs = """
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="60%" stop-color="#0f1730"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#121a36"/>
      <stop offset="100%" stop-color="#0d152b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6ea8ff"/>
      <stop offset="100%" stop-color="#8ef0ff"/>
    </linearGradient>
    <linearGradient id="photo-sky-a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d2a4d"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="photo-sky-b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a2b57"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="photo-sky-c" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#162445"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="photo-sheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M 64 0 L 0 0 0 64" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#050b1d" flood-opacity="0.6"/>
    </filter>
    <style>
      .display { font-family: "Space Grotesk", "Segoe UI", sans-serif; font-weight: 700; }
      .body { font-family: "Space Grotesk", "Segoe UI", sans-serif; }
      .fg { fill: #e6ecff; }
      .muted { fill: #9fb0d7; }
    </style>
  </defs>
"""
    return f"""<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
{defs}
  <rect width="{width}" height="{height}" fill="url(#bg)"/>
  <rect width="{width}" height="{height}" fill="url(#grid)" opacity="0.35"/>
{content}
</svg>
"""


photo = PhotoMaker()


home_desktop = f"""
  <rect x="0" y="0" width="1440" height="72" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="80" y="46" class="display fg" font-size="20">VINFREAK</text>
  <text x="220" y="46" class="body muted" font-size="11" letter-spacing="3">PERFORMANCE CARS</text>
  <text x="980" y="46" class="body muted" font-size="13">Browse</text>
  <text x="1060" y="46" class="body muted" font-size="13">Auctions</text>
  <text x="1145" y="46" class="body muted" font-size="13">Sell</text>
  <rect x="1255" y="24" width="125" height="32" rx="16" fill="url(#accent)"/>
  <text x="1318" y="46" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Submit</text>

  <rect x="80" y="96" width="1280" height="240" rx="24" fill="url(#panel)" stroke="rgba(110,168,255,0.25)" filter="url(#shadow)"/>
  <text x="120" y="132" class="body muted" font-size="11" letter-spacing="3">VINFREAK PERFORMANCE CARS FOR SALE</text>
  <text x="120" y="176" class="display fg" font-size="34">Discover performance</text>
  <text x="120" y="214" class="display fg" font-size="34">and provenance</text>
  <text x="120" y="246" class="body muted" font-size="14">Auctions, verified dealers, and signal rich data.</text>
  <rect x="120" y="262" width="360" height="42" rx="12" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.35)"/>
  <text x="140" y="288" class="body muted" font-size="12">Search by VIN, model, dealer</text>
  <rect x="490" y="262" width="120" height="42" rx="21" fill="url(#accent)"/>
  <text x="550" y="288" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Search</text>

  <rect x="820" y="124" width="500" height="188" rx="18" fill="rgba(10,16,34,0.94)" stroke="rgba(110,168,255,0.24)"/>
  {photo.block(842,148,456,96,'a')}
  <text x="842" y="270" class="body muted" font-size="11" letter-spacing="2">FEATURED AUCTION</text>
  <text x="842" y="292" class="body fg" font-size="14" font-weight="600">2023 Porsche 911 GT3</text>
  <rect x="1160" y="260" width="120" height="28" rx="14" fill="rgba(110,168,255,0.2)" stroke="rgba(110,168,255,0.35)"/>
  <text x="1220" y="280" text-anchor="middle" class="body muted" font-size="10">Ends 3h</text>

  <text x="80" y="372" class="display fg" font-size="20">Featured auctions</text>
  <rect x="80" y="392" width="400" height="190" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(98,410,364,100,'b')}
  <text x="98" y="538" class="body fg" font-size="13" font-weight="600">2021 Porsche 911 GT3</text>
  <text x="98" y="558" class="body muted" font-size="11">$229,000 - 4,120 mi</text>

  <rect x="520" y="392" width="400" height="190" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(538,410,364,100,'c')}
  <text x="538" y="538" class="body fg" font-size="13" font-weight="600">2018 BMW M3 Competition</text>
  <text x="538" y="558" class="body muted" font-size="11">$68,900 - 22,300 mi</text>

  <rect x="960" y="392" width="400" height="190" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(978,410,364,100,'a')}
  <text x="978" y="538" class="body fg" font-size="13" font-weight="600">1997 Toyota Supra Turbo</text>
  <text x="978" y="558" class="body muted" font-size="11">$134,000 - 31,500 mi</text>

  <text x="80" y="620" class="display fg" font-size="20">Ending soon</text>
  <rect x="80" y="640" width="310" height="160" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(96,656,278,96,'b')}
  <rect x="400" y="640" width="310" height="160" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(416,656,278,96,'c')}
  <rect x="720" y="640" width="310" height="160" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(736,656,278,96,'a')}
  <rect x="1040" y="640" width="320" height="160" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(1056,656,288,96,'b')}
"""


browse_photos = []
card_positions = [
    (380, 140),
    (710, 140),
    (1040, 140),
    (380, 380),
    (710, 380),
    (1040, 380),
    (380, 620),
    (710, 620),
    (1040, 620),
]
variants = ["a", "b", "c", "b", "c", "a", "c", "a", "b"]
for (x, y), v in zip(card_positions, variants):
    browse_photos.append(photo.block(x + 16, y + 16, 288, 110, v))


browse_desktop = f"""
  <rect x="0" y="0" width="1440" height="72" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="80" y="46" class="display fg" font-size="20">VINFREAK</text>
  <text x="220" y="46" class="body muted" font-size="11" letter-spacing="3">PERFORMANCE CARS</text>
  <text x="980" y="46" class="body muted" font-size="13">Browse</text>
  <text x="1060" y="46" class="body muted" font-size="13">Auctions</text>
  <text x="1145" y="46" class="body muted" font-size="13">Sell</text>
  <rect x="1255" y="24" width="125" height="32" rx="16" fill="url(#accent)"/>
  <text x="1318" y="46" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Submit</text>

  <text x="80" y="116" class="display fg" font-size="24">Browse inventory</text>
  <text x="320" y="116" class="body muted" font-size="12">3,182 listings</text>
  <rect x="1040" y="92" width="320" height="34" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.35)"/>
  <text x="1060" y="114" class="body muted" font-size="12">Sort by: Ending soon</text>

  <rect x="80" y="140" width="280" height="680" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.18)"/>
  <text x="104" y="174" class="body muted" font-size="11" letter-spacing="2">FILTERS</text>
  <rect x="104" y="196" width="232" height="44" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="120" y="223" class="body muted" font-size="12">Make</text>
  <rect x="104" y="252" width="232" height="44" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="120" y="279" class="body muted" font-size="12">Model</text>
  <rect x="104" y="308" width="232" height="44" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="120" y="335" class="body muted" font-size="12">Year</text>
  <rect x="104" y="364" width="232" height="44" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="120" y="391" class="body muted" font-size="12">Price</text>
  <rect x="104" y="420" width="232" height="44" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="120" y="447" class="body muted" font-size="12">Transmission</text>
  <rect x="104" y="476" width="232" height="44" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="120" y="503" class="body muted" font-size="12">Location</text>
  <rect x="104" y="544" width="232" height="40" rx="20" fill="url(#accent)"/>
  <text x="220" y="569" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Apply filters</text>

  <rect x="380" y="140" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="710" y="140" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="1040" y="140" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="380" y="380" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="710" y="380" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="1040" y="380" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="380" y="620" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="710" y="620" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="1040" y="620" width="320" height="220" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {''.join(browse_photos)}
"""


thumbs = (
    photo.block(100, 420, 120, 50, "b")
    + photo.block(230, 420, 120, 50, "c")
    + photo.block(360, 420, 120, 50, "a")
)


detail_desktop = f"""
  <rect x="0" y="0" width="1440" height="72" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="80" y="46" class="display fg" font-size="20">VINFREAK</text>
  <text x="220" y="46" class="body muted" font-size="11" letter-spacing="3">PERFORMANCE CARS</text>
  <text x="980" y="46" class="body muted" font-size="13">Browse</text>
  <text x="1060" y="46" class="body muted" font-size="13">Auctions</text>
  <text x="1145" y="46" class="body muted" font-size="13">Sell</text>
  <rect x="1255" y="24" width="125" height="32" rx="16" fill="url(#accent)"/>
  <text x="1318" y="46" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Submit</text>

  <text x="80" y="110" class="body muted" font-size="12">Home / Listings / 2023 Porsche 911 GT3</text>

  <rect x="80" y="130" width="820" height="360" rx="20" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.2)"/>
  {photo.block(100,150,780,260,'a')}
  {thumbs}

  <rect x="920" y="130" width="440" height="360" rx="20" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.25)" filter="url(#shadow)"/>
  <text x="950" y="170" class="display fg" font-size="20">$229,000</text>
  <text x="950" y="196" class="body muted" font-size="12">Current bid</text>
  <rect x="950" y="214" width="380" height="44" rx="22" fill="url(#accent)"/>
  <text x="1140" y="242" text-anchor="middle" class="body" font-size="13" fill="#0b1020" font-weight="700">Bid now</text>
  <rect x="950" y="270" width="380" height="34" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.2)"/>
  <text x="970" y="292" class="body muted" font-size="12">Ends in 3h 14m</text>
  <rect x="950" y="320" width="180" height="30" rx="15" fill="rgba(110,168,255,0.2)" stroke="rgba(110,168,255,0.35)"/>
  <text x="1040" y="340" text-anchor="middle" class="body muted" font-size="11">Verified seller</text>
  <rect x="950" y="366" width="380" height="92" rx="12" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.2)"/>
  <text x="970" y="396" class="body muted" font-size="12">VIN: WP0ZZZ99ZTS392124</text>
  <text x="970" y="420" class="body muted" font-size="12">Location: Austin, TX</text>

  <rect x="80" y="520" width="1280" height="40" rx="12" fill="rgba(10,16,34,0.9)" stroke="rgba(110,168,255,0.2)"/>
  <text x="110" y="546" class="body fg" font-size="13">Overview</text>
  <text x="210" y="546" class="body muted" font-size="13">Specs</text>
  <text x="300" y="546" class="body muted" font-size="13">History</text>
  <text x="400" y="546" class="body muted" font-size="13">Comments</text>

  <rect x="80" y="580" width="820" height="260" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="920" y="580" width="440" height="260" rx="18" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <text x="110" y="616" class="body muted" font-size="12">SPEC HIGHLIGHTS</text>
  <rect x="110" y="632" width="220" height="60" rx="12" fill="rgba(8,12,24,0.9)"/>
  <rect x="340" y="632" width="220" height="60" rx="12" fill="rgba(8,12,24,0.9)"/>
  <rect x="570" y="632" width="220" height="60" rx="12" fill="rgba(8,12,24,0.9)"/>
"""


share_desktop = f"""
  <rect x="0" y="0" width="1440" height="72" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="80" y="46" class="display fg" font-size="20">VINFREAK</text>
  <text x="220" y="46" class="body muted" font-size="11" letter-spacing="3">PERFORMANCE CARS</text>
  <text x="980" y="46" class="body muted" font-size="13">Browse</text>
  <rect x="1255" y="24" width="125" height="32" rx="16" fill="url(#accent)"/>
  <text x="1318" y="46" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Submit</text>

  <rect x="80" y="100" width="1280" height="360" rx="20" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.2)"/>
  {photo.block(100,120,1240,320,'c')}
  <rect x="80" y="480" width="880" height="280" rx="20" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <text x="110" y="520" class="display fg" font-size="22">2023 Porsche 911 GT3</text>
  <text x="110" y="548" class="body muted" font-size="13">Austin, TX - 4,120 mi - Manual</text>
  <rect x="110" y="570" width="220" height="34" rx="17" fill="rgba(110,168,255,0.2)" stroke="rgba(110,168,255,0.35)"/>
  <text x="220" y="592" text-anchor="middle" class="body muted" font-size="12">FreakScore 92</text>

  <rect x="980" y="480" width="380" height="280" rx="20" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="1010" y="520" class="body muted" font-size="12">Share this listing</text>
  <rect x="1010" y="544" width="330" height="42" rx="21" fill="url(#accent)"/>
  <text x="1175" y="570" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Copy link</text>
  <rect x="1010" y="600" width="160" height="36" rx="18" fill="rgba(110,168,255,0.18)" stroke="rgba(110,168,255,0.28)"/>
  <rect x="1180" y="600" width="160" height="36" rx="18" fill="rgba(110,168,255,0.18)" stroke="rgba(110,168,255,0.28)"/>
  <text x="1090" y="623" text-anchor="middle" class="body muted" font-size="11">Share to X</text>
  <text x="1260" y="623" text-anchor="middle" class="body muted" font-size="11">Share to FB</text>
"""


empty_desktop = f"""
  <rect x="0" y="0" width="1440" height="72" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="80" y="46" class="display fg" font-size="20">VINFREAK</text>

  <rect x="420" y="220" width="600" height="360" rx="24" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.25)" filter="url(#shadow)"/>
  <circle cx="720" cy="300" r="44" fill="rgba(110,168,255,0.2)" stroke="rgba(110,168,255,0.4)"/>
  <text x="720" y="306" text-anchor="middle" class="display fg" font-size="18">404</text>
  <text x="720" y="370" text-anchor="middle" class="display fg" font-size="22">Listing not found</text>
  <text x="720" y="404" text-anchor="middle" class="body muted" font-size="13">Try searching inventory or return to the homepage.</text>
  <rect x="560" y="440" width="320" height="44" rx="22" fill="url(#accent)"/>
  <text x="720" y="468" text-anchor="middle" class="body" font-size="12" fill="#0b1020" font-weight="700">Back to browse</text>
  <rect x="560" y="494" width="320" height="40" rx="20" fill="rgba(110,168,255,0.18)" stroke="rgba(110,168,255,0.28)"/>
  <text x="720" y="519" text-anchor="middle" class="body muted" font-size="12">Search inventory</text>
"""


home_mobile = f"""
  <rect x="0" y="0" width="390" height="56" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="20" y="34" class="display fg" font-size="16">VINFREAK</text>
  <rect x="310" y="16" width="60" height="24" rx="12" fill="url(#accent)"/>
  <text x="340" y="32" text-anchor="middle" class="body" font-size="10" fill="#0b1020" font-weight="700">Submit</text>

  <rect x="16" y="76" width="358" height="220" rx="18" fill="url(#panel)" stroke="rgba(110,168,255,0.25)"/>
  <text x="32" y="110" class="body muted" font-size="10" letter-spacing="2">VINFREAK PERFORMANCE CARS</text>
  <text x="32" y="140" class="display fg" font-size="20">Discover performance</text>
  <text x="32" y="166" class="display fg" font-size="20">and provenance</text>
  <rect x="32" y="190" width="250" height="36" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.35)"/>
  <text x="44" y="213" class="body muted" font-size="11">Search by VIN or model</text>
  <rect x="286" y="190" width="72" height="36" rx="18" fill="url(#accent)"/>
  <text x="322" y="213" text-anchor="middle" class="body" font-size="10" fill="#0b1020" font-weight="700">Go</text>

  <text x="16" y="328" class="display fg" font-size="16">Featured auctions</text>
  <rect x="16" y="346" width="358" height="140" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(30,362,330,70,'a')}
  <text x="30" y="454" class="body fg" font-size="12" font-weight="600">2023 Porsche 911 GT3</text>
  <text x="30" y="472" class="body muted" font-size="10">$229,000 - 4,120 mi</text>

  <text x="16" y="520" class="display fg" font-size="16">Ending soon</text>
  <rect x="16" y="538" width="358" height="120" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(30,554,330,60,'b')}
  <rect x="16" y="670" width="358" height="120" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(30,686,330,60,'c')}
"""


browse_mobile = f"""
  <rect x="0" y="0" width="390" height="56" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="20" y="34" class="display fg" font-size="16">VINFREAK</text>
  <rect x="312" y="16" width="60" height="24" rx="12" fill="url(#accent)"/>
  <text x="342" y="32" text-anchor="middle" class="body" font-size="10" fill="#0b1020" font-weight="700">Filter</text>

  <text x="16" y="86" class="display fg" font-size="18">Browse inventory</text>
  <rect x="16" y="104" width="358" height="34" rx="10" fill="rgba(8,12,24,0.9)" stroke="rgba(110,168,255,0.35)"/>
  <text x="30" y="126" class="body muted" font-size="11">Sort by: Ending soon</text>

  <rect x="16" y="154" width="358" height="170" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(30,170,330,90,'b')}
  <rect x="16" y="336" width="358" height="170" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(30,352,330,90,'c')}
  <rect x="16" y="518" width="358" height="170" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(30,534,330,90,'a')}
  <rect x="16" y="700" width="358" height="120" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  {photo.block(30,716,330,60,'b')}
"""


detail_mobile = f"""
  <rect x="0" y="0" width="390" height="56" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="20" y="34" class="display fg" font-size="16">VINFREAK</text>
  <text x="320" y="34" class="body muted" font-size="10">Share</text>

  <text x="16" y="82" class="body muted" font-size="10">Listings / 2023 Porsche 911 GT3</text>
  <rect x="16" y="96" width="358" height="220" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.2)"/>
  {photo.block(32,112,326,140,'a')}

  <rect x="16" y="330" width="358" height="150" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="32" y="366" class="display fg" font-size="18">$229,000</text>
  <text x="32" y="388" class="body muted" font-size="11">Current bid</text>
  <rect x="32" y="404" width="326" height="36" rx="18" fill="url(#accent)"/>
  <text x="195" y="428" text-anchor="middle" class="body" font-size="11" fill="#0b1020" font-weight="700">Bid now</text>

  <rect x="16" y="492" width="358" height="170" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <text x="32" y="528" class="body muted" font-size="11">Specs and highlights</text>
  <rect x="32" y="544" width="150" height="40" rx="10" fill="rgba(8,12,24,0.9)"/>
  <rect x="200" y="544" width="150" height="40" rx="10" fill="rgba(8,12,24,0.9)"/>
"""


share_mobile = f"""
  <rect x="0" y="0" width="390" height="56" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="20" y="34" class="display fg" font-size="16">VINFREAK</text>

  <rect x="16" y="76" width="358" height="220" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.2)"/>
  {photo.block(32,92,326,180,'c')}

  <rect x="16" y="310" width="358" height="220" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(255,255,255,0.08)"/>
  <text x="32" y="346" class="display fg" font-size="18">2023 Porsche 911 GT3</text>
  <text x="32" y="370" class="body muted" font-size="11">Austin, TX - 4,120 mi</text>
  <rect x="32" y="392" width="160" height="30" rx="15" fill="rgba(110,168,255,0.2)" stroke="rgba(110,168,255,0.35)"/>
  <text x="112" y="412" text-anchor="middle" class="body muted" font-size="10">FreakScore 92</text>

  <rect x="16" y="540" width="358" height="160" rx="16" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <text x="32" y="570" class="body muted" font-size="11">Share this listing</text>
  <rect x="32" y="590" width="326" height="36" rx="18" fill="url(#accent)"/>
  <text x="195" y="613" text-anchor="middle" class="body" font-size="11" fill="#0b1020" font-weight="700">Copy link</text>
  <rect x="32" y="634" width="150" height="32" rx="16" fill="rgba(110,168,255,0.18)" stroke="rgba(110,168,255,0.28)"/>
  <rect x="208" y="634" width="150" height="32" rx="16" fill="rgba(110,168,255,0.18)" stroke="rgba(110,168,255,0.28)"/>
"""


empty_mobile = f"""
  <rect x="0" y="0" width="390" height="56" fill="rgba(12,18,38,0.88)" stroke="rgba(110,168,255,0.2)"/>
  <text x="20" y="34" class="display fg" font-size="16">VINFREAK</text>

  <rect x="30" y="220" width="330" height="300" rx="22" fill="rgba(12,18,38,0.9)" stroke="rgba(110,168,255,0.25)"/>
  <circle cx="195" cy="290" r="36" fill="rgba(110,168,255,0.2)" stroke="rgba(110,168,255,0.4)"/>
  <text x="195" y="296" text-anchor="middle" class="display fg" font-size="16">404</text>
  <text x="195" y="352" text-anchor="middle" class="display fg" font-size="18">Listing not found</text>
  <text x="195" y="376" text-anchor="middle" class="body muted" font-size="11">Try browsing inventory instead.</text>
  <rect x="70" y="404" width="250" height="36" rx="18" fill="url(#accent)"/>
  <text x="195" y="428" text-anchor="middle" class="body" font-size="11" fill="#0b1020" font-weight="700">Back to browse</text>
  <rect x="70" y="448" width="250" height="32" rx="16" fill="rgba(110,168,255,0.18)" stroke="rgba(110,168,255,0.28)"/>
  <text x="195" y="468" text-anchor="middle" class="body muted" font-size="10">Search inventory</text>
"""


files = {
    "V1-future-PATCH-home-desktop.svg": svg_doc(1440, 900, home_desktop),
    "V1-future-PATCH-browse-desktop.svg": svg_doc(1440, 900, browse_desktop),
    "V1-future-PATCH-detail-desktop.svg": svg_doc(1440, 900, detail_desktop),
    "V1-future-PATCH-share-desktop.svg": svg_doc(1440, 900, share_desktop),
    "V1-future-PATCH-empty-desktop.svg": svg_doc(1440, 900, empty_desktop),
    "V1-future-PATCH-home-mobile.svg": svg_doc(390, 844, home_mobile),
    "V1-future-PATCH-browse-mobile.svg": svg_doc(390, 844, browse_mobile),
    "V1-future-PATCH-detail-mobile.svg": svg_doc(390, 844, detail_mobile),
    "V1-future-PATCH-share-mobile.svg": svg_doc(390, 844, share_mobile),
    "V1-future-PATCH-empty-mobile.svg": svg_doc(390, 844, empty_mobile),
}

for name, content in files.items():
    (OUT_DIR / name).write_text(content, encoding="utf-8")
    print(f"Wrote {name}")
