export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'installed';

export interface InstallEnvironment {
  platform: InstallPlatform;
  isIos: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  isInAppBrowser: boolean;
  isSafari: boolean;
  isChromium: boolean;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export function isStandaloneMode(
  navigatorLike: NavigatorWithStandalone = navigator as NavigatorWithStandalone,
  matchMediaLike: typeof window.matchMedia | undefined =
    typeof window !== 'undefined' ? window.matchMedia.bind(window) : undefined,
): boolean {
  const displayModeStandalone = matchMediaLike?.('(display-mode: standalone)').matches ?? false;
  return displayModeStandalone || navigatorLike.standalone === true;
}

export function detectInstallEnvironment(
  userAgent: string,
  vendor = '',
  standalone = false,
): InstallEnvironment {
  const ua = userAgent || '';
  const normalizedVendor = vendor || '';
  const isAndroid = /Android/i.test(ua);
  const isIpadOsDesktopUa = /Macintosh/i.test(ua) && /Mobile/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua) || isIpadOsDesktopUa;
  const isInAppBrowser = /WhatsApp|Instagram|FBAN|FBAV|Line\//i.test(ua);
  const isCriOS = /CriOS/i.test(ua);
  const isFxiOS = /FxiOS/i.test(ua);
  const isEdgiOS = /EdgiOS/i.test(ua);
  const isSafari =
    isIos &&
    /AppleWebKit/i.test(ua) &&
    !isCriOS &&
    !isFxiOS &&
    !isEdgiOS &&
    !isInAppBrowser &&
    /Apple/i.test(normalizedVendor || 'Apple');
  const isChromium = /Chrome|CriOS|Chromium|EdgA|EdgiOS/i.test(ua) && !isInAppBrowser;

  let platform: InstallPlatform = 'desktop';
  if (standalone) platform = 'installed';
  else if (isIos) platform = 'ios';
  else if (isAndroid) platform = 'android';

  return {
    platform,
    isIos,
    isAndroid,
    isStandalone: standalone,
    isInAppBrowser,
    isSafari,
    isChromium,
  };
}
