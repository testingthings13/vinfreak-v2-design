import { useId } from "react";

export default function VinfreakLogo({ className = "", idPrefix, ...props }) {
  const generatedId = useId();
  const baseId = idPrefix ?? generatedId;
  const gradientId = `${baseId}-car`;

  return (
    <svg
      className={className}
      viewBox="0 0 120 60"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#ff4d6d" />
          <stop offset="100%" stopColor="#ff6b81" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M13 34c-2.76 0-5-2.24-5-5v-4.5c0-5.16 3.19-9.75 8.03-11.45L35.5 6.9C41.92 4.74 48.63 3.6 55.38 3.6h17.5c6.1 0 12.08 1.61 17.34 4.67l11.7 6.68H110c5.52 0 10 4.48 10 10v8c0 2.76-2.24 5-5 5h-3.3c-.96 4.6-5.05 8-9.94 8s-8.98-3.4-9.94-8H38.18c-.96 4.6-5.05 8-9.94 8s-8.98-3.4-9.94-8H13Z"
      />
      <circle cx="35" cy="42" r="7" fill="#0b1020" />
      <circle cx="96" cy="42" r="7" fill="#0b1020" />
      <circle cx="35" cy="42" r="3.5" fill="#ff6b81" />
      <circle cx="96" cy="42" r="3.5" fill="#ff6b81" />
    </svg>
  );
}
