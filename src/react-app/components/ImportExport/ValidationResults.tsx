import React from 'react';

interface ValidationResultsProps {
  errors: string[];
}

export default function ValidationResults({ errors }: ValidationResultsProps) {
  if (errors.length === 0) return null;
  return (
    <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">
      <div className="font-medium mb-1">Erros de validação</div>
      <ul className="list-disc pl-5 space-y-1">
        {errors.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
    </div>
  );
}

