export interface ConnectorBackupCleanupResult {
  cleaned: boolean;
  error: string;
}

export async function cleanupActivatedConnectorBackup(
  cleanup: () => Promise<void>
): Promise<ConnectorBackupCleanupResult> {
  try {
    await cleanup();
    return { cleaned: true, error: '' };
  } catch (error: unknown) {
    return {
      cleaned: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
