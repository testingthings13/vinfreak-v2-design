const LIKE_REACTION_PHRASES = [
  "Wow! 🤯",
  "Damn! 😮‍💨",
  "Crazy! 🤪",
  "Insane! 🌀",
  "Gorgeous! ✨",
  "Beautiful! 🌟",
  "Unreal! 🚀",
  "Stunning! 💫",
  "Wild! 🐆",
  "Clean! 🧼",
  "Perfect! ✅",
  "Fire! 🔥",
  "Mint! 🍃",
  "Ridiculous! 🤘",
  "Sick! 😎",
  "Savage! 🗡️",
  "Hot! ♨️",
  "Dream! 💭",
  "Nuts! 🥜",
  "Legendary! 🏆",
  "Iconic! 🎯",
  "Exotic! 🦜",
  "Mean! 😤",
  "Beast! 🐅",
  "Wicked! 🧪",
  "Rare! 💎",
  "Flawless! 💯",
  "Next-level! ⏫",
  "Crazy-nice! 🤝",
  "Absolute unit! 🛡️",
  "So clean! ✨",
  "Absolute weapon! ⚔️",
  "Pure art! 🎨",
  "Straight fire! 🔥",
  "Mint spec! 📋",
  "Dream build! 🛠️",
  "Full send! 🏁",
  "God tier! 👑",
  "Unreal spec! 🧬",
  "Tasteful! 🍷",
  "Chef’s kiss! 👨‍🍳💋",
  "Collector grade! 🗃️",
  "Peak form! 🧗",
  "Crazy clean! 🧽",
  "Dialed in! 🎛️",
  "Perfect spec! 📐",
  "OEM+! 🛞",
  "Show car! 🎪",
  "Period correct! 🕰️",
  "Proper! 🎩",
  "Absolute unit! 🪖",
  "Built right! 🔧",
  "Time capsule! ⏳",
  "Unreal find! 🕵️",
  "Just wow! 😲",
  "Straight up mint! 🌱",
  "Car goals! 🚗",
  "Museum piece! 🖼️",
  "Top tier! 🥇",
  "Holy grail! ✝️",
];

const PALETTE_CLASSES = [
  "like-burst--palette-carbon",
  "like-burst--palette-horizon",
  "like-burst--palette-ember",
  "like-burst--palette-ionic",
  "like-burst--palette-glacier",
  "like-burst--palette-vapor",
  "like-burst--palette-serum",
  "like-burst--palette-strobe",
  "like-burst--palette-velocity",
  "like-burst--palette-prism",
];

const MOTION_CLASSES = [
  "like-burst--motion-orbit",
  "like-burst--motion-thrust",
  "like-burst--motion-vortex",
  "like-burst--motion-flicker",
  "like-burst--motion-surge",
  "like-burst--motion-glide",
  "like-burst--motion-drift",
  "like-burst--motion-ripple",
  "like-burst--motion-tilt",
  "like-burst--motion-flare",
];

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48);

export const LIKE_BURST_VARIANTS = LIKE_REACTION_PHRASES.map((phrase, index) => {
  const palette = PALETTE_CLASSES[index % PALETTE_CLASSES.length];
  const motion = MOTION_CLASSES[index % MOTION_CLASSES.length];
  const slug = slugify(phrase) || `phrase-${index + 1}`;
  return {
    id: `${slug}-${index + 1}`,
    label: phrase,
    className: `${palette} ${motion}`,
  };
});

export function getRandomBurstVariant(previousId = null) {
  if (LIKE_BURST_VARIANTS.length === 0) {
    return { id: "default", label: "🚗💥 +1!", className: "" };
  }

  if (LIKE_BURST_VARIANTS.length === 1) {
    return LIKE_BURST_VARIANTS[0];
  }

  let variant = null;
  do {
    const index = Math.floor(Math.random() * LIKE_BURST_VARIANTS.length);
    variant = LIKE_BURST_VARIANTS[index];
  } while (variant.id === previousId);

  return variant;
}
