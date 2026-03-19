"use client";

interface AIModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const models = [
  {
    key: "openai",
    label: "OpenAI GPT-4",
    description: "Most accurate, slower",
    // purple-only accent
    color: "from-[#7b2ff2] to-[#5a20c7]",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    key: "groq",
    label: "Groq LLM",
    description: "Faster, good quality",
    // purple-only accent
    color: "from-[#7b2ff2] to-[#5a20c7]",

    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function AIModelSelector({ selectedModel, onModelChange }: AIModelSelectorProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {models.map((model) => (
        <button
          key={model.key}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-br ${model.color} text-white font-medium transition-all duration-300 hover:scale-105 focus:scale-105 focus:outline-none focus:ring-2 focus:ring-white/20 ${
            selectedModel === model.key 
              ? "ring-2 ring-purple-500 shadow-lg scale-105" 
              : "opacity-80 hover:opacity-100 shadow-md"
          }`}
          onClick={() => onModelChange(model.key)}
          type="button"
        >
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            {model.icon}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold">{model.label}</div>
            <div className="text-xs opacity-90">{model.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

