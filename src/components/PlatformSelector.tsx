"use client";

const platforms = [
  {
    key: "youtube",
    label: "YouTube Shorts",
    color: "bg-gradient-to-br from-[#FF0000] to-[#e60000] hover:from-[#e60000] hover:to-[#cc0000]",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#FF0000"/>
        <path d="M22.5 16.5L13.5 22V11L22.5 16.5Z" fill="#fff"/>
      </svg>
    ),
  },
  {
    key: "instagram",
    label: "Instagram Reels",
    color: "bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] hover:from-[#f0c000] hover:via-[#e01a6b] hover:to-[#5a20c7]",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="url(#ig-gradient)"/>
        <defs>
          <linearGradient id="ig-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f9ce34"/>
            <stop offset="0.5" stopColor="#ee2a7b"/>
            <stop offset="1" stopColor="#6228d7"/>
          </linearGradient>
        </defs>
        <path d="M16 11.5C13.5147 11.5 11.5 13.5147 11.5 16C11.5 18.4853 13.5147 20.5 16 20.5C18.4853 20.5 20.5 18.4853 20.5 16C20.5 13.5147 18.4853 11.5 16 11.5ZM16 19C14.3431 19 13 17.6569 13 16C13 14.3431 14.3431 13 16 13C17.6569 13 19 14.3431 19 16C19 17.6569 17.6569 19 16 19Z" fill="#fff"/>
        <circle cx="23" cy="9" r="2" fill="#fff"/>
      </svg>
    ),
  },
  {
    key: "tiktok",
    label: "TikTok Reels",
    color: "bg-gradient-to-br from-[#010101] to-[#222] hover:from-[#222] hover:to-[#333]",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#010101"/>
        <path d="M23 14.5c-2.2 0-4-1.8-4-4V8h2.2c.2 1.2 1.2 2.2 2.4 2.4V14.5zM13 24c-2.8 0-5-2.2-5-5s2.2-5 5-5v2c-1.7 0-3 1.3-3 3s1.3 3 3 3c1.7 0 3-1.3 3-3v-7h2v7c0 2.8-2.2 5-5 5z" fill="#fff"/>
        <path d="M23 14.5c-2.2 0-4-1.8-4-4V8h2.2c.2 1.2 1.2 2.2 2.4 2.4V14.5z" fill="#25F4EE"/>
        <path d="M13 24c-2.8 0-5-2.2-5-5s2.2-5 5-5v2c-1.7 0-3 1.3-3 3s1.3 3 3 3c1.7 0 3-1.3 3-3v-7h2v7c0 2.8-2.2 5-5 5z" fill="#FE2C55"/>
      </svg>
    ),
  },
];

interface PlatformSelectorProps {
  selectedPlatform: string;
  onPlatformChange: (platform: string) => void;
}

export default function PlatformSelector({ selectedPlatform, onPlatformChange }: PlatformSelectorProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {platforms.map((platform) => (
        <button
          key={platform.key}
          className={`flex items-center gap-4 px-4 py-3 rounded-xl ${platform.color} shadow-lg border border-white/30 transition-all duration-300 hover:scale-105 focus:scale-105 focus:outline-none focus:ring-2 focus:ring-white/20 ${
            selectedPlatform === platform.key 
              ? "ring-2 ring-[#7b2ff2] scale-105 shadow-xl" 
              : "opacity-90 hover:opacity-100"
          }`}
          onClick={() => onPlatformChange(platform.key)}
          type="button"
        >
          <span>{platform.icon}</span>
          <span className="font-semibold text-white tracking-wide text-base">{platform.label}</span>
        </button>
      ))}
    </div>
  );
}

