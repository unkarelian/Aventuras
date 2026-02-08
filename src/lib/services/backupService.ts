/**
 * BackupService — Creates full backup ZIPs of the user's database and story data.
 *
 * The backup includes:
 * - The raw SQLite database (via VACUUM INTO for atomic consistency)
 * - All stories exported as individual .avt JSON files
 * - All settings as a JSON file
 * - Metadata about the backup
 */

import { save } from '@tauri-apps/plugin-dialog'
import { writeFile, readFile, remove, exists } from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { getVersion } from '@tauri-apps/api/app'
import { database } from './database'
import { gatherStoryData } from './export/ExportCoordinationService'
import type { AventuraExport } from './export'

const EXPORT_VERSION = '1.7.0'

class BackupService {
  /**
   * Create a full backup ZIP containing the database, all stories, and settings.
   * @returns true if backup was saved, false if user cancelled the dialog
   */
  async createFullBackup(): Promise<boolean> {
    // 1. Prompt user for save location first (fail fast if they cancel)
    const datestamp = new Date().toISOString().slice(0, 10)
    const savePath = await save({
      title: 'Save Aventura Backup',
      defaultPath: `aventura-backup-${datestamp}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })

    if (!savePath) return false

    console.log('[Backup] Starting full backup...')

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()

    let appVersion = '0.0.0'
    try {
      appVersion = await getVersion()
    } catch {
      // ignore
    }

    // 2. Create a consistent DB snapshot via VACUUM INTO
    let dbBytes: Uint8Array | null = null
    const tempDir = await path.tempDir()
    const tempDbPath = await path.join(tempDir, `aventura-backup-${Date.now()}.db`)

    try {
      await database.vacuumInto(tempDbPath)

      if (await exists(tempDbPath)) {
        dbBytes = await readFile(tempDbPath)
      }
    } catch (error) {
      console.warn('[Backup] VACUUM INTO failed, falling back to direct file copy:', error)
      // Fallback: try reading the DB file directly from app data dir
      try {
        const appDataDir = await path.appDataDir()
        const dbPath = await path.join(appDataDir, 'aventura.db')
        if (await exists(dbPath)) {
          dbBytes = await readFile(dbPath)
        }
      } catch (fallbackError) {
        console.error('[Backup] Direct copy also failed:', fallbackError)
      }
    } finally {
      // Clean up temp file
      try {
        if (await exists(tempDbPath)) {
          await remove(tempDbPath)
        }
      } catch {
        // Non-critical cleanup failure
      }
    }

    if (dbBytes) {
      zip.file('aventura.db', dbBytes)
      console.log(`[Backup] Database snapshot: ${(dbBytes.length / 1024 / 1024).toFixed(2)} MB`)
    } else {
      console.warn('[Backup] Could not include database snapshot')
    }

    // 3. Export all settings
    try {
      const allSettings = await database.getAllSettings()
      zip.file('settings.json', JSON.stringify(allSettings, null, 2))
      console.log(`[Backup] Settings: ${Object.keys(allSettings).length} keys`)
    } catch (error) {
      console.warn('[Backup] Failed to export settings:', error)
    }

    // 4. Export each story as .avt
    let storyCount = 0
    try {
      const stories = await database.getAllStories()
      console.log(`[Backup] Exporting ${stories.length} stories...`)

      for (const story of stories) {
        try {
          const data = await gatherStoryData(story.id)

          // Get background image for the story's current branch
          let currentBgImage: string | null = null
          try {
            currentBgImage = await database.getBackgroundForBranch(
              story.id,
              story.currentBranchId ?? null,
            )
          } catch {
            // Non-critical
          }

          const exportData: AventuraExport = {
            version: EXPORT_VERSION,
            exportedAt: Date.now(),
            story,
            entries: data.entries,
            characters: data.characters,
            locations: data.locations,
            items: data.items,
            storyBeats: data.storyBeats,
            lorebookEntries: data.lorebookEntries,
            styleReviewState: story.styleReviewState,
            embeddedImages: data.embeddedImages,
            checkpoints: data.checkpoints,
            branches: data.branches,
            chapters: data.chapters,
            currentBgImage,
          }

          const filename = this.sanitizeFilename(story.title || 'untitled')
          zip.file(`stories/${filename}.avt`, JSON.stringify(exportData, null, 2))
          storyCount++
        } catch (error) {
          console.error(`[Backup] Failed to export story "${story.title}":`, error)
          // Continue with other stories
        }
      }
    } catch (error) {
      console.error('[Backup] Failed to enumerate stories:', error)
    }

    // 5. Add metadata
    const metadata = {
      version: 1,
      createdAt: new Date().toISOString(),
      appVersion,
      storyCount,
      hasDatabaseSnapshot: dbBytes !== null,
      databaseSizeBytes: dbBytes?.length ?? 0,
    }
    zip.file('metadata.json', JSON.stringify(metadata, null, 2))
    console.log('[Backup] Metadata:', metadata)

    // 6. Generate and write the ZIP
    console.log('[Backup] Generating ZIP...')
    const zipData = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    await writeFile(savePath, zipData)
    console.log(`[Backup] Saved to ${savePath} (${(zipData.length / 1024 / 1024).toFixed(2)} MB)`)

    return true
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100)
  }
}

export const backupService = new BackupService()
