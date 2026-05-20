
interface ProgressBarProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  variant?: 'blue' | 'green' | 'yellow' | 'red';
}

export default function ProgressBar({ 
  progress, 
  label, 
  showPercentage = true,
  variant = 'blue' 
}: ProgressBarProps) {
  const colors = {
    blue: 'bg-primary',
    green: 'bg-green-600',
    yellow: 'bg-yellow-600',
    red: 'bg-red-600'
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {showPercentage && (
            <span className="text-sm font-medium text-gray-600">
              {Math.round(progress)}%
            </span>
          )}
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-300 ${colors[variant]}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
