/**
 * StatsPanel - Dashboard component displaying library and session statistics
 *
 * Shows three sections:
 * - Library Overview: Total, Imported, Rejected, Deferred, Pending counts
 * - Session Stats: Items processed this session
 * - Processing Velocity: Items per day and week
 */

import { RegistryService } from '../registry/registry-service';
import { SessionTracker, SessionStats } from './session-tracker';

export interface StatsPanelOptions {
  registry: RegistryService;
  sessionTracker: SessionTracker;
  totalZoteroItems: number;
}

export function renderStatsPanel(
  container: HTMLElement,
  options: StatsPanelOptions
): HTMLElement {
  const { registry, sessionTracker, totalZoteroItems } = options;
  const registryStats = registry.getStats();
  const sessionStats = sessionTracker.getStats();

  const panel = container.createDiv({ cls: 'zotbridge-stats-panel' });

  // Library Overview section
  const librarySection = panel.createDiv({ cls: 'stats-section' });
  librarySection.createEl('h4', { text: 'Library Overview' });

  const libraryGrid = librarySection.createDiv({ cls: 'stats-grid' });
  createStatItem(libraryGrid, 'Total', totalZoteroItems);
  createStatItem(libraryGrid, 'Imported', registryStats.imported, 'stat-success');
  createStatItem(libraryGrid, 'Rejected', registryStats.rejected, 'stat-muted');
  createStatItem(libraryGrid, 'Deferred', registryStats.deferred || 0);

  // Calculate pending (total minus all processed states)
  const pending = totalZoteroItems - registryStats.imported - registryStats.rejected - (registryStats.deferred || 0);
  createStatItem(libraryGrid, 'Pending', Math.max(0, pending), 'stat-pending');

  // Session section
  const sessionSection = panel.createDiv({ cls: 'stats-section' });
  sessionSection.createEl('h4', { text: 'This Session' });

  const sessionGrid = sessionSection.createDiv({ cls: 'stats-grid' });
  createStatItem(sessionGrid, 'Processed', sessionStats.itemsProcessed);
  createStatItem(sessionGrid, 'Accepted', sessionStats.itemsAccepted, 'stat-success');
  createStatItem(sessionGrid, 'Rejected', sessionStats.itemsRejected, 'stat-muted');
  createStatItem(sessionGrid, 'Deferred', sessionStats.itemsDeferred);

  // Velocity section
  const velocitySection = panel.createDiv({ cls: 'stats-section' });
  velocitySection.createEl('h4', { text: 'Processing Velocity' });

  const velocity = calculateVelocity(registry);
  const velocityGrid = velocitySection.createDiv({ cls: 'stats-grid' });
  createStatItem(velocityGrid, 'Today', velocity.itemsPerDay);
  createStatItem(velocityGrid, 'This Week', velocity.itemsPerWeek);

  return panel;
}

function createStatItem(
  container: HTMLElement,
  label: string,
  value: number,
  cls?: string
): void {
  const item = container.createDiv({ cls: 'stat-item' });
  item.createDiv({ cls: 'stat-value ' + (cls || ''), text: String(value) });
  item.createDiv({ cls: 'stat-label', text: label });
}

interface VelocityStats {
  itemsPerDay: number;
  itemsPerWeek: number;
}

function calculateVelocity(registry: RegistryService): VelocityStats {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

  // Get all entries with timestamps
  const allEntries = registry.getAllEntries();

  // Count items processed (imported, rejected, deferred) in timeframes
  const processedStates = ['imported', 'rejected', 'deferred'];

  const lastDayItems = allEntries.filter(e =>
    e.entry.timestamp >= oneDayAgo && processedStates.includes(e.entry.state)
  ).length;

  const lastWeekItems = allEntries.filter(e =>
    e.entry.timestamp >= oneWeekAgo && processedStates.includes(e.entry.state)
  ).length;

  return {
    itemsPerDay: lastDayItems,
    itemsPerWeek: lastWeekItems
  };
}
