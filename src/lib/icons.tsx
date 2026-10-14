import {
  Banknote, Bus, Briefcase, Clapperboard, Dumbbell, Ellipsis, Gift, GraduationCap, HeartPulse, Home, Kanban, Laptop,
  Landmark, PawPrint, Plane, Repeat, ShoppingBag, Smartphone, Store, Tag, Target, TrendingUp, TriangleAlert, Users,
  Utensils, Wallet, Wifi, Zap, PiggyBank, Coffee, Car, Shirt, Music, Baby, Gamepad2, Book, Wrench, Sparkles, Coins,
  CreditCard, Shield, Camera, Bike, Fuel, Pill, Tv, Receipt, Gem, Rocket, TreePalm, type LucideIcon,
} from 'lucide-react'

/** Conjunto acotado de iconos disponibles para categorías, cuentas y metas (evita importar toda la librería). */
export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, bus: Bus, home: Home, zap: Zap, wifi: Wifi, 'heart-pulse': HeartPulse, 'graduation-cap': GraduationCap,
  clapperboard: Clapperboard, 'shopping-bag': ShoppingBag, laptop: Laptop, repeat: Repeat, landmark: Landmark, users: Users,
  'paw-print': PawPrint, plane: Plane, 'triangle-alert': TriangleAlert, ellipsis: Ellipsis, briefcase: Briefcase, kanban: Kanban,
  store: Store, 'trending-up': TrendingUp, gift: Gift, tag: Tag, wallet: Wallet, banknote: Banknote, target: Target,
  dumbbell: Dumbbell, smartphone: Smartphone, 'piggy-bank': PiggyBank, coffee: Coffee, car: Car, shirt: Shirt, music: Music,
  baby: Baby, gamepad: Gamepad2, book: Book, wrench: Wrench, sparkles: Sparkles, coins: Coins, 'credit-card': CreditCard,
  shield: Shield, camera: Camera, bike: Bike, fuel: Fuel, pill: Pill, tv: Tv, receipt: Receipt, gem: Gem, rocket: Rocket,
  'tree-palm': TreePalm,
}

export const ICON_NAMES = Object.keys(ICONS)

export function Icon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const C = ICONS[name] ?? Tag
  return <C className={className} style={style} aria-hidden />
}

export const COLOR_CHOICES = [
  '#6366F1', '#8B5CF6', '#A855F7', '#EC4899', '#F43F5E', '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9', '#3B82F6', '#94A3B8',
]
