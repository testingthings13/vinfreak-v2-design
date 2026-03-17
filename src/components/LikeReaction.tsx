import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const REACTIONS = [
  // Emojis
  "🔥", "🤙", "💪", "⚡", "🏎️", "😍", "🙌", "💯", "🎯", "🚀",
  "👏", "✨", "💎", "🏆", "⭐",
  // Words
  "WHOO!", "NICE!", "SICK!", "BEAST!", "FIRE!",
  "WOW!", "INSANE!", "CLEAN!", "MINT!", "SAVAGE!",
  "LFG!", "DREAM!", "GOAL!", "YES!", "EPIC!",
];

function pickRandom(count: number) {
  const shuffled = [...REACTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

interface Particle {
  id: number;
  text: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

interface LikeReactionProps {
  trigger: number; // increment to trigger
  originRef: React.RefObject<HTMLElement>;
}

export default function LikeReaction({ trigger, originRef }: LikeReactionProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  const burst = useCallback(() => {
    const items = pickRandom(6);
    const newParticles: Particle[] = items.map((text, i) => ({
      id: Date.now() + i,
      text,
      x: (Math.random() - 0.5) * 160,
      y: -(40 + Math.random() * 100),
      rotation: (Math.random() - 0.5) * 60,
      scale: 0.7 + Math.random() * 0.6,
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 2500);
  }, []);

  useEffect(() => {
    if (trigger > 0) burst();
  }, [trigger, burst]);

  return (
    <AnimatePresence>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.3, rotate: 0 }}
          animate={{
            opacity: 0,
            x: p.x,
            y: p.y,
            scale: p.scale,
            rotate: p.rotation,
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.0, ease: "easeOut" }}
          className="absolute pointer-events-none select-none font-black text-sm whitespace-nowrap z-50"
          style={{
            color: `hsl(${Math.random() * 360}, 80%, 55%)`,
            textShadow: "0 1px 4px rgba(0,0,0,0.3)",
            bottom: "100%",
            left: "50%",
          }}
        >
          {p.text}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}
