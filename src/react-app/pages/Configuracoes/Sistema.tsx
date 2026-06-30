import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Globe, Image, Save, RotateCcw, Settings2, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/react-app/i18n/useLanguage';
import { SupportedLanguage } from '@/react-app/i18n/translations';

import {
  applySystemSettingsToDocument,
  DEFAULT_SYSTEM_SETTINGS,
  fetchSystemSettingsFromServer,
  getSystemSettings,
  mapServerToLocalSettings,
  normalizeSystemSettings,
  saveSystemSettings,
  saveSystemSettingsToServer,
  SystemSettings,
  uploadSystemBrandingAsset,
} from '@/react-app/config/systemSettings';
import { SettingsSectionIntro } from './components/SettingsSectionIntro';
import { AVIATION_TIMEZONES } from '@/react-app/utils/timezone';

// Nota: todo o sistema de branding usa base64 data-URLs para máxima confiabilidade.
// O upload para R2 acontece em background para outros usos (certificados etc.).

const LOGO_MAX_BYTES = 10 * 1024 * 1024;
const FAVICON_MAX_BYTES = 10 * 1024 * 1024;
const LOGO_DIMENSIONS = { width: 1024, height: 320 };
const FAVICON_DIMENSIONS = { width: 512, height: 512 };
type LanguageSelection = SupportedLanguage | 'auto';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      resolve(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('Erro ao carregar imagem'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function resizeToPngFile(
  file: File,
  target: { width: number; height: number },
  outputName: string,
): Promise<File> {
  const image = await loadImageFromBlob(file);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas não disponível');
  ctx.clearRect(0, 0, target.width, target.height);
  const scale = Math.min(target.width / image.width, target.height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (target.width - drawWidth) / 2;
  const offsetY = (target.height - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((generated) => {
      if (generated) resolve(generated);
      else reject(new Error('Falha ao gerar PNG'));
    }, 'image/png');
  });
  return new File([blob], outputName, { type: 'image/png' });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SistemaConfiguracoes() {
  const [form, setForm] = useState<SystemSettings>(() => getSystemSettings());
  const [serverForm, setServerForm] = useState<SystemSettings>(() => getSystemSettings());
  const [empresaId, setEmpresaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'favicon' | null>(null);
  const { language, isAutomatic, setLanguage, setAutomaticLanguage, t } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageSelection>(
    isAutomatic ? 'auto' : language,
  );

  // hasChanges compara com o que foi salvo no servidor (não o localStorage)
  const hasChanges = useMemo(() => {
    return JSON.stringify(serverForm) !== JSON.stringify(form);
  }, [form, serverForm]);

  // Carregar settings do servidor na montagem
  useEffect(() => {
    let mounted = true;
    fetchSystemSettingsFromServer()
      .then((server) => {
        if (!mounted) return;
        setEmpresaId(server.empresaId);
        const mapped = mapServerToLocalSettings(server);
        setForm(mapped);
        setServerForm(mapped);
        saveSystemSettings(mapped);
        applySystemSettingsToDocument(mapped);
      })
      .catch(() => {
        if (mounted) toast.error(t('settings.system.loadError'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    setSelectedLanguage(isAutomatic ? 'auto' : language);
  }, [isAutomatic, language]);

  // Upload + armazena base64 diretamente no form → sem URLs do R2, sem problemas de CORS
  const handleUpload =
    (
      field: 'logoDataUrl' | 'faviconDataUrl',
      maxBytes: number,
      label: string,
      expectedDimensions: { width: number; height: number },
      target: 'sistema-logo' | 'sistema-favicon',
    ) =>
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      if (!empresaId) {
        toast.error(t('settings.system.companyMissing'));
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${label}: apenas imagens são permitidas`);
        return;
      }
      if (file.size > maxBytes) {
        toast.error(`${label}: tamanho máximo ${formatBytes(maxBytes)}`);
        return;
      }

      setUploading(field === 'logoDataUrl' ? 'logo' : 'favicon');
      try {
        // 1. Redimensionar e converter para PNG
        const processedFile = await resizeToPngFile(file, expectedDimensions, `${target}.png`);

        // 2. Converter para base64 data URL — É ESTE QUE VAI PARA O SISTEMA
        const base64 = await fileToDataUrl(processedFile);

        // 3. Atualizar o form COM O BASE64 (não URL do servidor)
        const newForm = normalizeSystemSettings({ ...form, [field]: base64 });
        setForm(newForm);

        // 4. Aplicar IMEDIATAMENTE ao Sidebar/favicon (não precisa salvar antes)
        saveSystemSettings(newForm);
        applySystemSettingsToDocument(newForm);

        // 5. Upload para R2 em background (para certificados/backup, não obrigatório)
        if (empresaId) {
          uploadSystemBrandingAsset(empresaId, processedFile, target).catch((err) => {
            console.warn('[Sistema] Upload R2 background falhou (não crítico):', err);
          });
        }

        toast.success(`${label} ${t('settings.system.uploadSuccess')}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Erro ao processar ${label}`);
      } finally {
        setUploading(null);
      }
    };

  const handleSave = async () => {
    if (!empresaId) {
      toast.error(t('settings.system.companyMissing'));
      return;
    }
    setSaving(true);
    try {
      await saveSystemSettingsToServer(form, empresaId);
      setServerForm(form); // marcar como salvo no servidor
      saveSystemSettings(form);
      applySystemSettingsToDocument(form);
      toast.success(t('settings.system.saveSuccess'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.system.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const resetForm = { ...DEFAULT_SYSTEM_SETTINGS };
    setForm(resetForm);
    setServerForm(resetForm);
    saveSystemSettings(resetForm);
    applySystemSettingsToDocument(resetForm);
    if (empresaId) {
      try {
        await saveSystemSettingsToServer(resetForm, empresaId);
      } catch {
        toast.warning(t('settings.system.resetWarning'));
        return;
      }
    }
    toast.success(t('settings.system.resetSuccess'));
  };

  const handleLanguageChange = async (newLanguage: LanguageSelection) => {
    setSelectedLanguage(newLanguage);
    if (newLanguage === 'auto') {
      await setAutomaticLanguage();
      toast.success(t('settings.system.language.changed'));
      return;
    }
    setLanguage(newLanguage);
    toast.success(t('settings.system.language.changed'));
  };

  return (
    <div className="space-y-4">
      <SettingsSectionIntro
        badge="Preferências da aplicação"
        title="Sistema"
        description="Padronize nome da aplicação, idioma, branding e preferências globais compatíveis com todo o sistema."
        icon={<MonitorSmartphone className="h-5 w-5" />}
      />

      {loading && (
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {t('settings.system.loading')}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 mb-4">
          <Settings2 className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.system.section.title')}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.system.appName.label')}
            </label>
            <input
              type="text"
              value={form.appName}
              maxLength={60}
              onChange={(e) => setForm((prev) => ({ ...prev, appName: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="AirTrust"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.system.appName.help')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.system.pageSize.label')}
            </label>
            <select
              value={form.defaultPageSize}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  defaultPageSize: Number(e.target.value) as 20 | 50 | 100,
                }))
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value={20}>{t('settings.system.pageSize.20')}</option>
              <option value={50}>{t('settings.system.pageSize.50')}</option>
              <option value={100}>{t('settings.system.pageSize.100')}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.system.pageSize.help')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('settings.system.language.label')}
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value as LanguageSelection)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="auto">{t('settings.system.language.auto')}</option>
              <option value="pt-BR">{t('settings.system.language.ptBr')}</option>
              <option value="en-US">{t('settings.system.language.enUs')}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('settings.system.language.help')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              Fuso horário operacional
            </label>
            <select
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {Object.entries(
                AVIATION_TIMEZONES.reduce<Record<string, typeof AVIATION_TIMEZONES>>(
                  (acc, tz) => {
                    if (!acc[tz.group]) acc[tz.group] = [];
                    acc[tz.group].push(tz);
                    return acc;
                  },
                  {},
                ),
              ).map(([group, tzList]) => (
                <optgroup key={group} label={group}>
                  {tzList.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Define o fuso horário usado em alertas, relatórios e cálculos operacionais.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {t('settings.system.compactHeader.label')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.system.compactHeader.help')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.compactHeader}
              onChange={(e) => setForm((prev) => ({ ...prev, compactHeader: e.target.checked }))}
              className="w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {t('settings.system.animations.label')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('settings.system.animations.help')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.enableAnimations}
              onChange={(e) => setForm((prev) => ({ ...prev, enableAnimations: e.target.checked }))}
              className="w-4 h-4"
            />
          </label>
        </div>
      </div>

      {/* Branding */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3 mb-4">
          <Image className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('settings.system.branding.title')}
          </h3>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Ao selecionar uma imagem, ela é aplicada <strong>imediatamente</strong> ao sistema. Clique
          em Salvar para persistir.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logo */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {t('settings.system.logo.title')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('settings.system.logo.help').replace('{max}', formatBytes(LOGO_MAX_BYTES))} —
              recomendado 1024×320 px
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800/60">
              <MonitorSmartphone className="w-4 h-4" />
              {uploading === 'logo' ? 'Processando…' : t('settings.system.logo.upload')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading !== null}
                onChange={handleUpload(
                  'logoDataUrl',
                  LOGO_MAX_BYTES,
                  t('settings.system.logo.title'),
                  LOGO_DIMENSIONS,
                  'sistema-logo',
                )}
              />
            </label>
            <div className="flex h-20 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-950">
              {form.logoDataUrl ? (
                <img
                  src={form.logoDataUrl}
                  alt={t('settings.system.logo.previewAlt')}
                  className="h-12 w-full object-contain"
                />
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t('settings.system.logo.none')}
                </span>
              )}
            </div>
          </div>

          {/* Favicon */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {t('settings.system.favicon.title')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('settings.system.favicon.help').replace('{max}', formatBytes(FAVICON_MAX_BYTES))} —
              recomendado 512×512 px
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60">
              <MonitorSmartphone className="w-4 h-4" />
              {uploading === 'favicon' ? 'Processando…' : t('settings.system.favicon.upload')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading !== null}
                onChange={handleUpload(
                  'faviconDataUrl',
                  FAVICON_MAX_BYTES,
                  t('settings.system.favicon.title'),
                  FAVICON_DIMENSIONS,
                  'sistema-favicon',
                )}
              />
            </label>
            <div className="flex h-20 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-950">
              {form.faviconDataUrl ? (
                <img
                  src={form.faviconDataUrl}
                  alt={t('settings.system.favicon.previewAlt')}
                  className="h-10 w-10 object-contain rounded"
                />
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t('settings.system.favicon.none')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={saving || uploading !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? t('settings.system.savingButton') : t('settings.system.saveButton')}
          </button>

          <button
            onClick={handleReset}
            disabled={saving || uploading !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60"
          >
            <RotateCcw className="w-4 h-4" />
            {t('settings.system.resetButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
