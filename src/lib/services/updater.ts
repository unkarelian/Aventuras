import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  available: boolean
  version?: string
  currentVersion?: string
  body?: string
  date?: string
}

export interface UpdateProgress {
  downloaded: number
  total: number | null
}

class UpdaterService {
  private updateAvailable: Update | null = null
  private checking = false
  private downloading = false
  private progress: UpdateProgress | null = null

  /**
   * Check for available updates
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    if (this.checking) {
      return { available: false }
    }

    this.checking = true

    try {
      const update = await check()

      if (update) {
        this.updateAvailable = update
        return {
          available: true,
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body ?? undefined,
          date: update.date ?? undefined,
        }
      }

      this.updateAvailable = null
      return { available: false }
    } catch (error) {
      console.error('[Updater] Check failed:', error)
      this.updateAvailable = null
      throw error
    } finally {
      this.checking = false
    }
  }

  /**
   * Download and install the available update
   */
  async downloadAndInstall(onProgress?: (progress: UpdateProgress) => void): Promise<boolean> {
    if (!this.updateAvailable || this.downloading) {
      return false
    }

    this.downloading = true
    this.progress = { downloaded: 0, total: null }

    try {
      await this.updateAvailable.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            this.progress = {
              downloaded: 0,
              total: event.data.contentLength ?? null,
            }
            break
          case 'Progress':
            if (this.progress) {
              this.progress.downloaded += event.data.chunkLength
            }
            break
          case 'Finished':
            // Download complete
            break
        }

        if (onProgress && this.progress) {
          onProgress({ ...this.progress })
        }
      })

      return true
    } catch (error) {
      console.error('[Updater] Download/install failed:', error)
      throw error
    } finally {
      this.downloading = false
      this.progress = null
    }
  }

  /**
   * Relaunch the application after update
   */
  async relaunch(): Promise<void> {
    try {
      await relaunch()
    } catch (error) {
      console.error('[Updater] Relaunch failed:', error)
    }
  }

  /**
   * Get current checking state
   */
  isChecking(): boolean {
    return this.checking
  }

  /**
   * Get current downloading state
   */
  isDownloading(): boolean {
    return this.downloading
  }

  /**
   * Get current download progress
   */
  getProgress(): UpdateProgress | null {
    return this.progress
  }

  /**
   * Check if an update is available
   */
  hasUpdate(): boolean {
    return this.updateAvailable !== null
  }

  /**
   * Get the available update info
   */
  getUpdateInfo(): UpdateInfo | null {
    if (!this.updateAvailable) return null

    return {
      available: true,
      version: this.updateAvailable.version,
      currentVersion: this.updateAvailable.currentVersion,
      body: this.updateAvailable.body ?? undefined,
      date: this.updateAvailable.date ?? undefined,
    }
  }
}

export const updaterService = new UpdaterService()
