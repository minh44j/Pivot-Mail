import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Bars3BottomLeftIcon,
  Bars3BottomRightIcon,
  Bars3Icon,
  BellIcon,
  BoltIcon,
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ClockIcon,
  CloudIcon,
  Cog6ToothIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  ExclamationCircleIcon,
  EyeIcon,
  FaceSmileIcon,
  FlagIcon,
  FolderIcon,
  HashtagIcon,
  IdentificationIcon,
  InboxIcon,
  LinkIcon,
  ListBulletIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MinusIcon,
  MoonIcon,
  NumberedListIcon,
  PaintBrushIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlusIcon,
  PrinterIcon,
  RectangleGroupIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Square3Stack3DIcon,
  StrikethroughIcon,
  SunIcon,
  TableCellsIcon,
  TagIcon,
  TrashIcon,
  TruckIcon,
  UserIcon,
  UsersIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'

/**
 * The app's icons: Heroicons, outline, 24 px grid (Minhaj, 2026-11-24: "update all our icons in heroicons").
 * The names stay the same, so every screen keeps working; only the drawing changes.
 */
type Hero = ComponentType<SVGProps<SVGSVGElement> & { title?: string }>

const HERO = {
  compose: PencilSquareIcon,
  trash: TrashIcon,
  archive: ArchiveBoxIcon,
  reply: ArrowUturnLeftIcon,
  forward: ArrowUturnRightIcon,
  tag: TagIcon,
  flag: FlagIcon,
  clip: PaperClipIcon,
  search: MagnifyingGlassIcon,
  inbox: InboxIcon,
  send: PaperAirplaneIcon,
  draft: DocumentTextIcon,
  chevron: ChevronDownIcon,
  back: ChevronLeftIcon,
  close: XMarkIcon,
  template: RectangleGroupIcon,
  check: CheckIcon,
  users: UsersIcon,
  eye: EyeIcon,
  folder: FolderIcon,
  download: ArrowDownTrayIcon,
  bell: BellIcon,
  layout: ViewColumnsIcon,
  threads: ChatBubbleLeftRightIcon,
  menu: Bars3Icon,
  lock: LockClosedIcon,
  listBullet: ListBulletIcon,
  undo: ArrowUturnLeftIcon,
  redo: ArrowUturnRightIcon,
  strike: StrikethroughIcon,
  table: TableCellsIcon,
  image: PhotoIcon,
  hrule: MinusIcon,
  emoji: FaceSmileIcon,
  highlight: PaintBrushIcon,
  importance: ExclamationCircleIcon,
  listNumber: NumberedListIcon,
  link: LinkIcon,
  alignLeft: Bars3BottomLeftIcon,
  alignRight: Bars3BottomRightIcon,
  sun: SunIcon,
  moon: MoonIcon,
  cloud: CloudIcon,
  storm: BoltIcon,
  sparkle: SparklesIcon,
  arrow: ArrowRightIcon,
  building: BuildingOffice2Icon,
  pin: MapPinIcon,
  print: PrinterIcon,
  popout: ArrowTopRightOnSquareIcon,
  user: UserIcon,
  more: EllipsisHorizontalIcon,
  copy: DocumentDuplicateIcon,
  settings: Cog6ToothIcon,
  important: ExclamationCircleIcon,
  hash: HashtagIcon,
  expand: ArrowsPointingOutIcon,
  collapse: ArrowsPointingInIcon,
  clock: ClockIcon,
  plus: PlusIcon,
  passport: IdentificationIcon,
  hotel: BuildingOfficeIcon,
  truck: TruckIcon,
  package: CubeIcon,
  boxes: Square3Stack3DIcon,
  clearance: ShieldCheckIcon,
} satisfies Record<string, Hero>

/**
 * Heroicons has no drawing for these. Each is drawn here in Heroicons' own style (24 px grid, 1.5 stroke, round ends), so
 * the whole set still reads as one family. Paths are separated by "|".
 */
const CLOUD = 'M2.25 13.5a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 13.5Z'
const DRAWN = {
  replyAll: 'M7.5 15 1.5 9l6-6|M12 15 6 9l6-6|M6 9h9a6 6 0 0 1 0 12h-3',
  indent: 'M3.75 6.75h16.5|M11.25 12h9|M3.75 17.25h16.5|M3.75 9.75 6.75 12l-3 2.25',
  outdent: 'M3.75 6.75h16.5|M11.25 12h9|M3.75 17.25h16.5|M6.75 9.75 3.75 12l3 2.25',
  ltr: 'M9.75 3.75v9|M13.5 3.75v9|M8.25 3.75h7.5|M9.75 8.25a2.25 2.25 0 0 1 0-4.5|M3.75 18.75h15.75|M17.25 16.5l2.25 2.25-2.25 2.25',
  rtl: 'M9.75 3.75v9|M13.5 3.75v9|M8.25 3.75h7.5|M9.75 8.25a2.25 2.25 0 0 1 0-4.5|M20.25 18.75H4.5|M6.75 16.5 4.5 18.75 6.75 21',
  alignCenter: 'M3.75 6.75h16.5|M3.75 12h16.5|M8.25 17.25h7.5',
  textColor: 'M6.75 15.75 12 3.75l5.25 12|M8.4 12h7.2|M4.5 20.25h15',
  clearFormat: 'M6.75 4.5h10.5|M12 4.5 9 16.5|M4.5 4.5l15 15',
  rain: `${CLOUD}|M8.25 20.25 7.5 21.75|M12.75 20.25 12 21.75|M17.25 20.25l-.75 1.5`,
  fog: 'M3.75 8.25h16.5|M3 12h18|M3.75 15.75h16.5|M6.75 19.5h10.5',
  car: 'M4.5 13.5l1.5-4.5a1.5 1.5 0 0 1 1.42-1.03h9.16a1.5 1.5 0 0 1 1.42 1.03l1.5 4.5|M3.75 13.5h16.5v3.75H3.75z|M6.75 17.25v1.5|M17.25 17.25v1.5|M7.5 15.375h.008|M16.5 15.375h.008',
  ship: 'M3 15l1.6 4.2a2 2 0 0 0 1.9 1.3h11a2 2 0 0 0 1.9-1.3L21 15H3z|M5.25 15V9h13.5v6|M9 9V5.25h6V9|M12 5.25V3',
  plane: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
} as const

export type IconName = keyof typeof HERO | keyof typeof DRAWN

export type Tone = 'red' | 'orange' | 'blue' | 'purple' | 'green' | 'teal' | 'gray'

export function Icon({ name, size = 18, tone, className: extra }: { name: IconName; size?: number; tone?: Tone; className?: string }) {
  const className = [tone ? `ic ic-${tone}` : '', extra ?? ''].filter(Boolean).join(' ') || undefined
  if (name in HERO) {
    const C = HERO[name as keyof typeof HERO] as Hero
    return <C width={size} height={size} className={className} aria-hidden="true" focusable="false" />
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {DRAWN[name as keyof typeof DRAWN].split('|').map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
