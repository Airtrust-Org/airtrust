import ControleVoosPrototypeBanner from './ControleVoosPrototypeBanner';
import ControleVoosSubnav from './ControleVoosSubnav';

export default function ControleVoosPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full">
      <ControleVoosPrototypeBanner />
      <ControleVoosSubnav />
      {children}
    </div>
  );
}
