import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import type {
  PromptExportData,
  ExportedGenerationPreset,
  ParsedPromptImport,
  ImportPresetConfig,
} from '$lib/types';
import { settings } from '$lib/stores/settings.svelte';
import type { GenerationPreset } from '$lib/types';
import { promptService } from '$lib/services/prompts';

const EXPORT_VERSION = '1.0.0';
const APP_VERSION = '1.9.0';

class PromptExportService {

  async exportPrompts(): Promise<boolean> {
    const exportData = this.buildExportData();

    const filePath = await save({
      defaultPath: `aventura-prompts-${this.formatDate()}.json`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
      ],
    });

    if (!filePath) return false;

    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    return true;
  }

  async pickAndReadImportFile(): Promise<string | null> {
    try {
      const filePath = await open({
        filters: [
          { name: 'JSON', extensions: ['json'] },
        ],
        multiple: false,
      });

      if (!filePath || typeof filePath !== 'string') return null;

      return await readTextFile(filePath);
    } catch (e) {
      console.error('Failed to pick/read file:', e);
      return null;
    }
  }

  buildExportData(): PromptExportData {
    const exportedPresets: ExportedGenerationPreset[] = settings.generationPresets.map(preset => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      model: preset.model,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [...preset.providerOnly],
      manualBody: preset.manualBody,
    }));

    return {
      version: EXPORT_VERSION,
      exportedAt: Date.now(),
      appVersion: APP_VERSION,
      promptSettings: {
        customMacros: JSON.parse(JSON.stringify(settings.promptSettings.customMacros)),
        macroOverrides: JSON.parse(JSON.stringify(settings.promptSettings.macroOverrides)),
        templateOverrides: JSON.parse(JSON.stringify(settings.promptSettings.templateOverrides)),
      },
      generationPresets: exportedPresets,
      servicePresetAssignments: { ...settings.servicePresetAssignments },
    };
  }

  parseImportFile(content: string): ParsedPromptImport {
    const errors: string[] = [];
    const warnings: string[] = [];

    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      return { success: false, data: null, errors: ['Invalid JSON file'], warnings: [] };
    }

    if (!data || typeof data !== 'object') {
      return { success: false, data: null, errors: ['Invalid file format'], warnings: [] };
    }

    const obj = data as Record<string, unknown>;

    if (!obj.version || typeof obj.version !== 'string') {
      errors.push('Missing or invalid version field');
    }

    if (!obj.promptSettings || typeof obj.promptSettings !== 'object') {
      errors.push('Missing promptSettings');
    }

    if (!obj.generationPresets || !Array.isArray(obj.generationPresets)) {
      errors.push('Missing or invalid generationPresets');
    }

    if (!obj.servicePresetAssignments || typeof obj.servicePresetAssignments !== 'object') {
      errors.push('Missing servicePresetAssignments');
    }

    if (errors.length > 0) {
      return { success: false, data: null, errors, warnings };
    }

    const version = obj.version as string;
    if (this.compareVersions(version, EXPORT_VERSION) > 0) {
      warnings.push(`File was created with a newer version (${version}). Some features may not import correctly.`);
    }

    const presets = obj.generationPresets as unknown[];
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i] as Record<string, unknown>;
      if (!preset.id || !preset.name) {
        warnings.push(`Preset at index ${i} is missing required fields`);
      }
    }

    return {
      success: true,
      data: obj as unknown as PromptExportData,
      errors: [],
      warnings,
    };
  }

  async applyImport(
    importData: PromptExportData,
    presetConfigs: Map<string, ImportPresetConfig>
  ): Promise<void> {
    settings.promptSettings.customMacros = importData.promptSettings.customMacros;
    settings.promptSettings.macroOverrides = importData.promptSettings.macroOverrides;
    settings.promptSettings.templateOverrides = importData.promptSettings.templateOverrides;
    await settings.savePromptSettings();

    const newPresets: GenerationPreset[] = importData.generationPresets.map(exported => {
      const config = presetConfigs.get(exported.id);
      return {
        id: exported.id,
        name: exported.name,
        description: exported.description,
        profileId: config?.profileId ?? null,
        model: config?.model ?? exported.model,
        temperature: config?.temperature ?? exported.temperature,
        maxTokens: config?.maxTokens ?? exported.maxTokens,
        reasoningEffort: config?.reasoningEffort ?? exported.reasoningEffort,
        providerOnly: config?.providerOnly ?? exported.providerOnly,
        manualBody: config?.manualBody ?? exported.manualBody,
      };
    });
    settings.generationPresets = newPresets;
    await settings.saveGenerationPresets();

    settings.servicePresetAssignments = { ...importData.servicePresetAssignments };
    await settings.saveServicePresetAssignments();

    promptService.init(settings.promptSettings);
  }

  private formatDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] ?? 0;
      const partB = partsB[i] ?? 0;
      if (partA !== partB) return partA - partB;
    }
    return 0;
  }
}

export const promptExportService = new PromptExportService();
