import type { NormalizedCar } from "@/lib/normalizeCar";

function toList(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string" && v.trim());
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((v: any) => typeof v === "string" && v.trim());
    } catch { /* not JSON */ }
    return trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

interface SectionProps {
  title: string;
  items: string[];
}

function BulletSection({ title, items }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="bg-card rounded-xl border border-border p-6 space-y-3">
      <h2 className="font-semibold text-lg">{title}</h2>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="text-primary mt-0.5 flex-shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface DetailSectionsProps {
  car: NormalizedCar;
}

export default function DetailSections({ car }: DetailSectionsProps) {
  const highlights = toList(car.highlights);
  const equipment = toList(car.equipment);
  const modifications = toList(car.modifications);
  const flaws = toList(car.knownFlaws);
  const service = toList(car.serviceHistory);
  const notes = toList(car.sellerNotes || car.other_items || car.ownership_history);

  return (
    <>
      {car.description && (
        <section className="bg-card rounded-xl border border-border p-6 space-y-3">
          <h2 className="font-semibold text-lg">Description</h2>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {car.description}
          </div>
        </section>
      )}

      <BulletSection title="Highlights" items={highlights} />
      <BulletSection title="Equipment" items={equipment} />
      <BulletSection title="Modifications" items={modifications} />
      <BulletSection title="Known Flaws" items={flaws} />
      <BulletSection title="Service History" items={service} />
      <BulletSection title="Additional Notes" items={notes} />
    </>
  );
}
