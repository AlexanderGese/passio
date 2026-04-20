/**
 * Client-side hit generators for Spotlight. Keep the list compact — this is
 * not a full emoji/keyword index, just the stuff a power user hits daily.
 * Adding more entries is cheap (~1 LOC each); the fuzzy match is a plain
 * `.includes` against the name + keywords.
 */

export type SystemAction = {
  id: string;
  label: string;
  keywords: string[];
  icon: string;
};

export const SYSTEM_ACTIONS: SystemAction[] = [
  { id: "lock", label: "Lock screen", keywords: ["lock", "screen"], icon: "🔒" },
  { id: "suspend", label: "Suspend / sleep", keywords: ["suspend", "sleep", "standby"], icon: "🌙" },
  { id: "brightness-up", label: "Brightness up", keywords: ["brightness", "up", "brighter", "+"], icon: "☀" },
  { id: "brightness-down", label: "Brightness down", keywords: ["brightness", "down", "dimmer", "-"], icon: "🌑" },
];

export type EmojiEntry = {
  emoji: string;
  name: string;
  keywords: string[];
};

// Curated ~80 common emojis. `name` powers the `:name` prefix; `keywords`
// cover natural-language lookups ("fire", "rocket", etc.).
export const EMOJIS: EmojiEntry[] = [
  { emoji: "😀", name: "grinning", keywords: ["smile", "happy"] },
  { emoji: "😁", name: "beaming", keywords: ["grin", "happy"] },
  { emoji: "😂", name: "joy", keywords: ["laugh", "tears", "lol"] },
  { emoji: "🤣", name: "rofl", keywords: ["laugh", "rolling"] },
  { emoji: "😊", name: "blush", keywords: ["smile", "happy"] },
  { emoji: "😉", name: "wink", keywords: ["flirt"] },
  { emoji: "😍", name: "heart_eyes", keywords: ["love"] },
  { emoji: "🥰", name: "smiling_hearts", keywords: ["love"] },
  { emoji: "😎", name: "cool", keywords: ["sunglasses"] },
  { emoji: "🤔", name: "thinking", keywords: ["thinking", "hmm"] },
  { emoji: "🙄", name: "eyeroll", keywords: ["whatever"] },
  { emoji: "😴", name: "sleepy", keywords: ["tired", "bored"] },
  { emoji: "😢", name: "sad", keywords: ["cry", "tear"] },
  { emoji: "😭", name: "sob", keywords: ["cry", "tears"] },
  { emoji: "😡", name: "angry", keywords: ["mad", "rage"] },
  { emoji: "🤯", name: "mind_blown", keywords: ["exploding", "wow"] },
  { emoji: "😱", name: "scream", keywords: ["shock", "omg"] },
  { emoji: "🤝", name: "handshake", keywords: ["deal"] },
  { emoji: "👍", name: "thumbsup", keywords: ["yes", "ok", "good"] },
  { emoji: "👎", name: "thumbsdown", keywords: ["no", "bad"] },
  { emoji: "👏", name: "clap", keywords: ["applause"] },
  { emoji: "🙏", name: "pray", keywords: ["thanks", "please"] },
  { emoji: "💪", name: "flex", keywords: ["strong", "muscle"] },
  { emoji: "🤷", name: "shrug", keywords: ["idk"] },
  { emoji: "👀", name: "eyes", keywords: ["look", "see"] },
  { emoji: "💯", name: "hundred", keywords: ["perfect", "100"] },
  { emoji: "🔥", name: "fire", keywords: ["hot", "lit"] },
  { emoji: "✨", name: "sparkles", keywords: ["magic", "shine"] },
  { emoji: "🎉", name: "tada", keywords: ["party", "celebrate"] },
  { emoji: "🎊", name: "confetti", keywords: ["party"] },
  { emoji: "🚀", name: "rocket", keywords: ["ship", "launch"] },
  { emoji: "⭐", name: "star", keywords: ["favorite"] },
  { emoji: "💡", name: "bulb", keywords: ["idea", "light"] },
  { emoji: "✅", name: "check", keywords: ["done", "ok", "yes"] },
  { emoji: "❌", name: "cross", keywords: ["no", "wrong"] },
  { emoji: "⚠", name: "warning", keywords: ["caution"] },
  { emoji: "❤", name: "heart", keywords: ["love"] },
  { emoji: "💔", name: "broken_heart", keywords: ["sad"] },
  { emoji: "🍇", name: "grapes", keywords: ["passio", "fruit"] },
  { emoji: "☕", name: "coffee", keywords: ["caffeine"] },
  { emoji: "🍵", name: "tea", keywords: ["drink"] },
  { emoji: "🍕", name: "pizza", keywords: ["food"] },
  { emoji: "🍔", name: "burger", keywords: ["food"] },
  { emoji: "🐛", name: "bug", keywords: ["issue"] },
  { emoji: "🐙", name: "octopus", keywords: ["github"] },
  { emoji: "🌈", name: "rainbow", keywords: ["pride"] },
  { emoji: "🌙", name: "moon", keywords: ["night"] },
  { emoji: "☀", name: "sun", keywords: ["day", "hot"] },
  { emoji: "⚡", name: "zap", keywords: ["fast", "lightning"] },
  { emoji: "🎯", name: "dart", keywords: ["target", "goal"] },
  { emoji: "📌", name: "pin", keywords: ["pinned"] },
  { emoji: "📝", name: "memo", keywords: ["note", "write"] },
  { emoji: "📎", name: "paperclip", keywords: ["attach"] },
  { emoji: "🔗", name: "link", keywords: ["url"] },
  { emoji: "🔑", name: "key", keywords: ["secret"] },
  { emoji: "🔒", name: "lock", keywords: ["secure"] },
  { emoji: "🔓", name: "unlock", keywords: ["open"] },
  { emoji: "💾", name: "save", keywords: ["disk", "store"] },
  { emoji: "💻", name: "laptop", keywords: ["computer"] },
  { emoji: "⌨", name: "keyboard", keywords: [] },
  { emoji: "🖱", name: "mouse", keywords: [] },
  { emoji: "📱", name: "phone", keywords: ["mobile"] },
  { emoji: "🎨", name: "art", keywords: ["design", "paint"] },
  { emoji: "🎵", name: "music", keywords: ["note"] },
  { emoji: "🎧", name: "headphones", keywords: ["audio"] },
  { emoji: "📷", name: "camera", keywords: ["photo"] },
  { emoji: "🎬", name: "clapper", keywords: ["movie", "film"] },
  { emoji: "📚", name: "books", keywords: ["study", "read"] },
  { emoji: "✏", name: "pencil", keywords: ["edit", "write"] },
  { emoji: "🛠", name: "tools", keywords: ["fix", "build"] },
  { emoji: "🧪", name: "test_tube", keywords: ["lab", "science"] },
  { emoji: "🧠", name: "brain", keywords: ["think", "smart"] },
  { emoji: "❓", name: "question", keywords: ["why", "?"] },
  { emoji: "❗", name: "bang", keywords: ["!"] },
];

export const SPOTLIGHT_SCOPES = [
  "app",
  "note",
  "todo",
  "goal",
  "vault",
  "file",
  "fact",
  "conv",
] as const;
export type SpotlightScope = (typeof SPOTLIGHT_SCOPES)[number];
