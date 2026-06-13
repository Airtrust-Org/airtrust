import MroPrototypeBanner from './MroPrototypeBanner';
import MroSubnav from './MroSubnav';

export default function MroPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full">
      <MroPrototypeBanner />
      <MroSubnav />
      {children}
    </div>
  );
}
