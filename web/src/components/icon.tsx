import {
  Sun as SunD,
  Zap as ZapD,
  Moon as MoonD,
  Copy as CopyD,
  User as UserD,
  Menu as MenuD,
  Check as CheckD,
  Globe as GlobeD,
  Circle as CircleD,
  Filter as FilterD,
  Server as ServerD,
  Shield as ShieldD,
  WifiOff as WifiOffD,
  Monitor as MonitorD,
  Package as PackageD,
  Download as DownloadD,
  Terminal as TerminalD,
  ChevronUp as ChevronUpD,
  ArrowRight as ArrowRightD,
  ChevronDown as ChevronDownD,
  ShieldCheck as ShieldCheckD,
  ChevronLeft as ChevronLeftD,
  CheckCircle2 as CheckCircle2D,
  ExternalLink as ExternalLinkD,
  ChevronRight as ChevronRightD,
  MoreHorizontal as MoreHorizontalD,
} from 'lucide';

import type { IconNode } from 'lucide';

export type IconProps = {
  size?: number | string;
  color?: string;
  className?: string;
  strokeWidth?: number | string;
};

const createIcon = (iconData: IconNode) => {
  return ({
    size = 24,
    color = 'currentColor',
    strokeWidth = 2,
    className,
    ...props
  }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={className}
      {...props}
    >
      {iconData.map(([Tag, attrs], index) => {
        return <Tag key={index} {...attrs} />;
      })}
    </svg>
  );
};

export const XIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="currentColor"
  >
    <title>X</title>
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

export const WordPressIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="currentColor"
  >
    <title>WordPress</title>
    <path d="M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0" />
  </svg>
);

export const GitHubIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="currentColor"
  >
    <title>GitHub</title>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

export const Sun = createIcon(SunD);
export const Zap = createIcon(ZapD);
export const Copy = createIcon(CopyD);
export const Moon = createIcon(MoonD);
export const Menu = createIcon(MenuD);
export const User = createIcon(UserD);
export const Globe = createIcon(GlobeD);
export const Check = createIcon(CheckD);
export const Server = createIcon(ServerD);
export const Filter = createIcon(FilterD);
export const Circle = createIcon(CircleD);
export const Shield = createIcon(ShieldD);
export const WifiOff = createIcon(WifiOffD);
export const Package = createIcon(PackageD);
export const Monitor = createIcon(MonitorD);
export const CheckIcon = createIcon(CheckD);
export const Download = createIcon(DownloadD);
export const Terminal = createIcon(TerminalD);
export const ArrowRight = createIcon(ArrowRightD);
export const ShieldCheck = createIcon(ShieldCheckD);
export const ChevronUpIcon = createIcon(ChevronUpD);
export const ExternalLink = createIcon(ExternalLinkD);
export const CheckCircle2 = createIcon(CheckCircle2D);
export const ChevronDownIcon = createIcon(ChevronDownD);
export const ChevronLeftIcon = createIcon(ChevronLeftD);
export const ChevronRightIcon = createIcon(ChevronRightD);
export const MoreHorizontalIcon = createIcon(MoreHorizontalD);
