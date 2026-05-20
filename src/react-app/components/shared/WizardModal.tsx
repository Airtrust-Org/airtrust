import { useState, cloneElement, ReactElement } from 'react';
import { X, Check, ChevronLeft, ChevronRight } from 'lucide-react';

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  steps: Array<{
    title: string;
    component: React.ReactNode;
  }>;
  onComplete?: (data: any) => void;
}

export function WizardModal({
  isOpen,
  onClose,
  title,
  description,
  steps,
  onComplete
}: WizardModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete?.(formData);
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateFormData = (stepData: Record<string, any>) => {
    setFormData(prev => ({ ...prev, ...stepData }));
  };

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* HEADER FIXO */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            {description && (
              <p className="text-sm text-gray-600 mt-1">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* PROGRESS BAR */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => (
              <div key={step.title} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                  currentStep > index
                    ? 'bg-green-600 border-green-600 text-white'
                    : currentStep === index
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white border-gray-300 text-gray-500'
                }`}>
                  {currentStep > index ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <div className={`flex-1 h-0.5 mx-2 ${
                  currentStep > index ? 'bg-green-600' : 'bg-gray-300'
                }`} style={{ display: index === steps.length - 1 ? 'none' : 'block' }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            {steps.map((step) => (
              <span key={step.title}>{step.title}</span>
            ))}
          </div>
        </div>

        {/* CONTEÚDO SCROLLÁVEL */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {cloneElement(steps[currentStep].component as ReactElement, {
            formData,
            updateFormData
          })}
        </div>

        {/* FOOTER COM BOTÕES */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={isFirstStep}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
            >
              {isLastStep ? 'Finalizar' : 'Próximo'}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
