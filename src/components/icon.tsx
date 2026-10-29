// One import per icon: the package index would bundle all of lucide's icons.
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import Bell from 'lucide-react-native/icons/bell';
import Camera from 'lucide-react-native/icons/camera';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import Clock from 'lucide-react-native/icons/clock';
import CloudOff from 'lucide-react-native/icons/cloud-off';
import CloudUpload from 'lucide-react-native/icons/cloud-upload';
import Delete from 'lucide-react-native/icons/delete';
import DoorOpen from 'lucide-react-native/icons/door-open';
import Droplet from 'lucide-react-native/icons/droplet';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import Flag from 'lucide-react-native/icons/flag';
import ImageIcon from 'lucide-react-native/icons/image';
import Info from 'lucide-react-native/icons/info';
import List from 'lucide-react-native/icons/list';
import LoaderCircle from 'lucide-react-native/icons/loader-circle';
import MapIcon from 'lucide-react-native/icons/map';
import MapPin from 'lucide-react-native/icons/map-pin';
import Mic from 'lucide-react-native/icons/mic';
import Navigation from 'lucide-react-native/icons/navigation';
import Pencil from 'lucide-react-native/icons/pencil';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Shield from 'lucide-react-native/icons/shield';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import User from 'lucide-react-native/icons/user';
import X from 'lucide-react-native/icons/x';
import type { ComponentType } from 'react';
import Svg, { Path } from 'react-native-svg';

import type { statusStyle } from '@/theme/tokens';

interface StrokeIconProps {
  size: number;
  color: string;
  strokeWidth: number;
}

/** Icons drawn from paths of the design, where lucide has no match (DESIGN_HANDOFF 4). */
function pathIcon(paths: string[]): ComponentType<StrokeIconProps> {
  return function PathIcon({ size, color, strokeWidth }: StrokeIconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    );
  };
}

const ICONS = {
  // the status icons of statusStyle (tokens.ts)
  check: Check,
  arc: LoaderCircle,
  exclam: pathIcon(['M12 5v9M12 19v.01']),
  x: X,
  pencil: Pencil,
  clock: Clock,
  swap: ArrowUpDown,
  // DESIGN_HANDOFF 4
  nfc: pathIcon(['M7 8.5a5 5 0 010 7', 'M11 6a9 9 0 010 12', 'M15 3.5a13 13 0 010 17']),
  flag: Flag,
  cloudOff: CloudOff,
  cloudUpload: CloudUpload,
  shield: Shield,
  back: ChevronLeft,
  map: MapIcon,
  list: List,
  camera: Camera,
  image: ImageIcon,
  mapPin: MapPin,
  bell: Bell,
  navigation: Navigation,
  mic: Mic,
  // incident categories (B-Esemeny)
  vandalism: pathIcon(['M4 4h16v16H4z', 'M4 4l7 7-3 3 5 6M20 9l-6 3']),
  door: DoorOpen,
  water: Droplet,
  person: User,
  more: Ellipsis,
  // other controls
  plus: Plus,
  eye: Eye,
  eyeOff: EyeOff,
  info: Info,
  warning: TriangleAlert,
  delete: Delete,
  refresh: RefreshCw,
} satisfies Record<string, ComponentType<StrokeIconProps>>;

export type IconName = keyof typeof ICONS;

// Compile-time: every status icon but the empty ring of a pending point has a drawing.
const _statusIconsDrawn: Exclude<(typeof statusStyle)[keyof typeof statusStyle]['icon'], 'ring'> extends IconName ? true : never = true;
void _statusIconsDrawn;

export interface IconProps {
  name: IconName;
  size: number;
  color: string;
  strokeWidth?: number;
}

/** A line icon of the design (24 grid, rounded ends); decorative: the meaning is always in a text or a label next to it. */
export function Icon({ name, size, color, strokeWidth = 2 }: IconProps) {
  const Drawing = ICONS[name];
  return <Drawing size={size} color={color} strokeWidth={strokeWidth} />;
}
