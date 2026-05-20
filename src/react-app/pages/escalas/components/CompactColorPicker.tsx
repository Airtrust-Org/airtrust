import { useEffect, useMemo, useState } from 'react';

type HSV = {
  h: number;
  s: number;
  v: number;
};

interface CompactColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  presets?: string[];
}

const DEFAULT_PRESETS = [
  '#2563EB',
  '#0EA5E9',
  '#14B8A6',
  '#22C55E',
  '#84CC16',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#6366F1',
  '#64748B',
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value: string | null | undefined): string | null {
  const input = String(value || '').trim();
  if (!input) return null;

  const withHash = input.startsWith('#') ? input : `#${input}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(withHash)) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) {
    return withHash.toUpperCase();
  }

  return null;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex) ?? '#2563EB';
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
  }

  return {
    h: Math.round((h * 60 + 360) % 360),
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToRgb(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const brightness = clamp(v, 0, 1);
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = brightness - chroma;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) {
    r1 = chroma;
    g1 = x;
  } else if (hue < 120) {
    r1 = x;
    g1 = chroma;
  } else if (hue < 180) {
    g1 = chroma;
    b1 = x;
  } else if (hue < 240) {
    g1 = x;
    b1 = chroma;
  } else if (hue < 300) {
    r1 = x;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = x;
  }

  return {
    r: Math.round((r1 + match) * 255),
    g: Math.round((g1 + match) * 255),
    b: Math.round((b1 + match) * 255),
  };
}

function hsvToHex(h: number, s: number, v: number) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function colorToHsv(color: string): HSV {
  const { r, g, b } = hexToRgb(color);
  return rgbToHsv(r, g, b);
}

export default function CompactColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
}: CompactColorPickerProps) {
  const normalizedValue = useMemo(() => normalizeHexColor(value) ?? '#2563EB', [value]);
  const [hsv, setHsv] = useState<HSV>(() => colorToHsv(normalizedValue));

  useEffect(() => {
    setHsv(colorToHsv(normalizedValue));
  }, [normalizedValue]);

  const currentHex = useMemo(() => hsvToHex(hsv.h, hsv.s, hsv.v), [hsv]);

  const commit = (next: HSV) => {
    setHsv(next);
    onChange(hsvToHex(next.h, next.s, next.v));
  };

  const updateFromPalette = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const s = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const v = clamp(1 - (event.clientY - bounds.top) / bounds.height, 0, 1);

    commit({ ...hsv, s, v });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 lg:w-[220px]">
          <div
            role="presentation"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPalette(event);
            }}
            onPointerMove={(event) => {
              if (
                (event.buttons & 1) !== 1 &&
                !event.currentTarget.hasPointerCapture(event.pointerId)
              ) {
                return;
              }
              updateFromPalette(event);
            }}
            className="relative h-32 w-full cursor-crosshair touch-none overflow-hidden rounded-xl border border-slate-200 shadow-inner"
            style={{
              backgroundColor: `hsl(${hsv.h} 100% 50%)`,
              backgroundImage:
                'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0)), linear-gradient(to right, rgba(255,255,255,1), rgba(255,255,255,0))',
            }}
          >
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)]"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                backgroundColor: currentHex,
              }}
            />
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            <span>Matiz</span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-mono normal-case tracking-normal text-slate-700">
              {currentHex}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={360}
            value={hsv.h}
            onChange={(event) => commit({ ...hsv, h: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-full border border-slate-200"
            style={{
              background:
                'linear-gradient(90deg, #ff0000 0%, #ffff00 16%, #00ff00 33%, #00ffff 50%, #0000ff 66%, #ff00ff 83%, #ff0000 100%)',
            }}
          />

          <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
              <span>Atalhos</span>
              <span className="normal-case tracking-normal text-slate-400">
                {presets.length} cores base
              </span>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-6 xl:grid-cols-8">
              {presets.map((preset) => {
                const normalizedPreset = normalizeHexColor(preset) ?? preset;
                const active = normalizedPreset === currentHex;

                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => commit(colorToHsv(normalizedPreset))}
                    title={normalizedPreset}
                    className={[
                      'h-7 w-7 rounded-full border transition-transform hover:scale-105',
                      active
                        ? 'border-slate-900 ring-2 ring-slate-300'
                        : 'border-white/80 shadow-sm',
                    ].join(' ')}
                    style={{ backgroundColor: normalizedPreset }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
