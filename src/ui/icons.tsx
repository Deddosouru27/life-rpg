/**
 * Реестр иконок. Единственный источник — lucide-react.
 * Эмодзи в системном интерфейсе запрещены (docs/DESIGN_SYSTEM.md §3.6).
 *
 * Все иконки outline, обводка 1.5, три размера-токена: 16 / 20 / 24.
 */

import {
  Activity,
  AlarmClock,
  Anchor,
  Award,
  BarChart3,
  Bed,
  Book,
  BookOpen,
  Brain,
  Brush,
  Calculator,
  Calendar,
  Candy,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cigarette,
  ClipboardList,
  Clock,
  CloudSun,
  Coins,
  Crown,
  Download,
  Drama,
  Droplet,
  Droplets,
  Dumbbell,
  Feather,
  Flame,
  FlaskConical,
  Footprints,
  Gem,
  GraduationCap,
  Hammer,
  Handshake,
  Headphones,
  Heart,
  Hourglass,
  Inbox,
  Info,
  Keyboard,
  Landmark,
  Languages,
  Link2,
  ListChecks,
  Lock,
  Mail,
  Map,
  Moon,
  MoonStar,
  Mountain,
  Package,
  Pencil,
  PenLine,
  PersonStanding,
  Phone,
  Minus,
  Plus,
  Puzzle,
  ReceiptText,
  RotateCcw,
  Salad,
  Scale,
  School,
  ScrollText,
  Search,
  Settings,
  Shield,
  Shirt,
  ShoppingCart,
  Smartphone,
  Snowflake,
  Sparkles,
  Store,
  Sun,
  Sunrise,
  Swords,
  Target,
  Trash2,
  Trees,
  TrendingUp,
  Trophy,
  Tv,
  Upload,
  UserRound,
  UtensilsCrossed,
  Wine,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Каталог по семантическим ключам. Данные ссылаются на ключ, не на компонент. */
export const ICONS = {
  // Тело
  dumbbell: Dumbbell,
  steps: Footprints,
  stretch: PersonStanding,
  droplet: Droplet,
  candy: Candy,
  sunrise: Sunrise,
  sleep: Bed,
  muscle: Activity,
  run: Zap,
  shower: Droplets,
  junkfood: UtensilsCrossed,
  salad: Salad,
  cigarette: Cigarette,
  wine: Wine,
  posture: PersonStanding,
  dawn: Sun,

  // Дух
  mosque: Landmark,
  scripture: BookOpen,
  beads: Gem,
  journal: PenLine,
  meditate: Brain,
  gratitude: Heart,
  charity: Handshake,
  call: Phone,
  nature: Trees,
  temper: Flame,
  night: MoonStar,
  peace: Feather,

  // Разум
  book: Book,
  study: GraduationCap,
  language: Languages,
  phoneAway: Smartphone,
  focus: Target,
  code: Keyboard,
  notes: ClipboardList,
  tv: Tv,
  audio: Headphones,
  chess: Puzzle,
  write: Pencil,
  weather: CloudSun,
  research: Search,
  school: School,

  // Дисциплина
  bed: Bed,
  cold: Snowflake,
  curfew: Moon,
  plan: ListChecks,
  clean: Brush,
  alarm: AlarmClock,
  hourglass: Hourglass,
  inbox: Inbox,
  laundry: Shirt,
  dishes: UtensilsCrossed,
  promise: Handshake,
  clock: Clock,
  map: Map,
  frog: FlaskConical,

  // Богатство
  receipt: ReceiptText,
  craft: Hammer,
  gold: Coins,
  bank: Landmark,
  cart: ShoppingCart,
  growth: TrendingUp,
  pitch: Drama,
  mail: Mail,
  calc: Calculator,
  coin: Coins,
  chart: BarChart3,
  chain: Link2,
  parcel: Package,
  scale: Scale,

  // Локации и торговцы
  town: Store,
  harbor: Anchor,
  highlands: Mountain,
  merchant: UserRound,

  // Атрибуты
  attrDiscipline: Swords,
  attrBody: Shield,
  attrSpirit: Feather,
  attrWealth: Crown,
  attrMind: BookOpen,

  // Навигация и система
  navToday: Flame,
  navHabits: BookOpen,
  navQuests: Swords,
  navShop: Store,
  navHero: Shield,
  settings: Settings,
  close: X,
  check: Check,
  plus: Plus,
  minus: Minus,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  trash: Trash2,
  edit: Pencil,
  reset: RotateCcw,
  calendar: Calendar,
  info: Info,
  lock: Lock,
  trophy: Trophy,
  award: Award,
  sparkles: Sparkles,
  scroll: ScrollText,
  download: Download,
  upload: Upload,
  heart: Heart,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export type IconSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<IconSize, number> = { sm: 16, md: 20, lg: 24 };

/** Есть ли такая иконка в реестре — данные могут ссылаться на устаревший ключ. */
export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

export function Icon({
  name,
  size = 'md',
  className,
  strokeWidth = 1.5,
}: {
  name: IconName | string;
  size?: IconSize;
  className?: string;
  strokeWidth?: number;
}): JSX.Element {
  // Неизвестный ключ не должен ронять экран — показываем нейтральную метку.
  const Component: LucideIcon = isIconName(name) ? ICONS[name] : Sparkles;
  return (
    <Component
      size={SIZE_PX[size]}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden
      focusable={false}
    />
  );
}
