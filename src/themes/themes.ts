/**
 * Centralized theme registry for Aventura.
 * Add new themes here and they'll automatically appear in the UI.
 */

export interface ThemeMetadata {
  id: string;
  label: string;
  description: string;
  isDark: boolean;
}

export const THEMES: ThemeMetadata[] = [
  {
    id: 'dark',
    label: 'Dark',
    description: 'Modern dark theme',
    isDark: true,
  },
  {
    id: 'light',
    label: 'Light (Paper)',
    description: 'Clean paper-like warm tones with amber accents',
    isDark: false,
  },
  {
    id: 'light-solarized',
    label: 'Light (Solarized)',
    description: 'Classic Solarized color scheme with cream backgrounds',
    isDark: false,
  },
  {
    id: 'pastel-dreams',
    label: 'Pastel Dreams',
    description: 'Soft lavender-pink with sky-blue accents, radiating gentle affection and cheerful sweetness',
    isDark: false,
  },
  {
    id: 'ocean-breeze',
    label: 'Ocean Breeze',
    description: 'Coastal elegance with stormy teal depths and warm coral accents, crisp and tranquil',
    isDark: false,
  },
  {
    id: 'retro-console',
    label: 'Retro Console',
    description: 'CRT aesthetic inspired by PS2-era games and Serial Experiments Lain',
    isDark: true,
  },
  {
    id: 'fallen-down',
    label: 'Fallen Down',
    description: '* The shadows deepen. Your adventure continues.',
    isDark: true,
  },
  {
    id: 'botanical',
    label: 'Botanical',
    description: 'Natural earth tones with organic accents',
    isDark: false,
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Neon-lit dystopian future aesthetic',
    isDark: true,
  },
  {
    id: 'fantasy',
    label: 'Fantasy',
    description: 'Magical realm with mystical atmosphere',
    isDark: true,
  },
  {
    id: 'oled',
    label: 'OLED',
    description: 'Pure black theme optimized for OLED displays',
    isDark: true,
  },
  {
    id: 'royal',
    label: 'Royal',
    description: 'Regal theme with rich, luxurious colors',
    isDark: true,
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin (Latte)',
    description: 'Light theme with warm, muted pastels inspired by café aesthetics',
    isDark: false,
  },
  {
    id: 'catppuccin-frappe',
    label: 'Catppuccin (Frappé)',
    description: 'Dark muted theme with soft pastels and warm undertones',
    isDark: true,
  },
  {
    id: 'catppuccin-macchiato',
    label: 'Catppuccin (Macchiato)',
    description: 'Medium contrast dark theme with vibrant pastels',
    isDark: true,
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin (Mocha)',
    description: 'Original dark theme with rich pastels and excellent contrast',
    isDark: true,
  },
  {
    id: 'rose-pine',
    label: 'Rosé Pine',
    description: 'Natural pine with muted, dusky tones and soho vibes',
    isDark: true,
  },
  {
    id: 'rose-pine-moon',
    label: 'Rosé Pine Moon',
    description: 'Darker variant with higher contrast and cooler undertones',
    isDark: true,
  },
  {
    id: 'rose-pine-dawn',
    label: 'Rosé Pine Dawn',
    description: 'Light variant with soft, warm colors for daytime comfort',
    isDark: false,
  },
  {
    id: 'dracula',
    label: 'Dracula',
    description: 'Official dark theme with vibrant purple/pink accents and excellent contrast',
    isDark: true,
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Arctic, north-bluish dark theme with minimal flat design and cyan accents',
    isDark: true,
  },
  {
    id: 'nord-light',
    label: 'Nord Light',
    description: 'Light variant with Snow Storm backgrounds and north-bluish accents',
    isDark: false,
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    description: 'Dark theme inspired by Tokyo neon nights with vibrant blue/purple accents',
    isDark: true,
  },
  {
    id: 'tokyo-night-light',
    label: 'Tokyo Night Light',
    description: 'Light variant inspired by Tokyo daytime with subtle blue/purple accents',
    isDark: false,
  },
  {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    description: 'Retro groove color scheme with warm, earthy tones and vintage aesthetic',
    isDark: true,
  },
  {
    id: 'gruvbox-light',
    label: 'Gruvbox Light',
    description: 'Light variant with cream backgrounds and warm earthy accents',
    isDark: false,
  },
];

/**
 * Get theme metadata by ID
 */
export function getTheme(id: string): ThemeMetadata | undefined {
  return THEMES.find((theme) => theme.id === id);
}

/**
 * Type for all valid theme IDs
 */
export type ThemeId = typeof THEMES[number]['id'];
