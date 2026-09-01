import MroPrototypeBanner from './MroPrototypeBanner';
import MroSubnav from './MroSubnav';

export default function MroPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full" role="main">
      <MroPrototypeBanner />
      <MroSubnav />
      {children}
    </main>
  );
}
