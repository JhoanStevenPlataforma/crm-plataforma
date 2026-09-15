import { useIsMobile } from "@/hooks/use-mobile";

// Matches the `h-14` topbar in `layout/Topbar.tsx`. The mobile figure is the
// bottom navigation, which this pass did not change.
const DENSE_NAVBAR_HEIGHT = 56;
const DENSE_NAVBAR_HEIGHT_MOBILE = 64;

export default function useAppBarHeight(): number {
  const isMobile = useIsMobile();
  return isMobile ? DENSE_NAVBAR_HEIGHT_MOBILE : DENSE_NAVBAR_HEIGHT;
}
