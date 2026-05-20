/**
 * Storage Utilities for GlobalTable and UI Components
 * Handles localStorage operations with type safety and error handling
 */

/**
 * Save sort state to localStorage
 * @param pageName - Unique page identifier
 * @param column - Sort column name
 * @param direction - Sort direction: 'asc' | 'desc' | 'none'
 */
export const saveSortState = (
  pageName: string,
  column: string | null,
  direction: 'asc' | 'desc' | 'none'
): void => {
  try {
    const key = `@airtrust/table-sort-${pageName}`;
    const state = { column, direction, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving sort state:', error);
  }
};

/**
 * Load sort state from localStorage
 * @param pageName - Unique page identifier
 * @returns Sort state or null if not found/invalid
 */
export const loadSortState = (
  pageName: string
): { column: string | null; direction: 'asc' | 'desc' | 'none' } | null => {
  try {
    const key = `@airtrust/table-sort-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const state = JSON.parse(stored);
    if (state.column && ['asc', 'desc', 'none'].includes(state.direction)) {
      return { column: state.column, direction: state.direction };
    }
    return null;
  } catch (error) {
    console.error('[StorageUtils] Error loading sort state:', error);
    return null;
  }
};

/**
 * Save column visibility state to localStorage
 * @param pageName - Unique page identifier
 * @param columnKeys - Array of visible column keys
 */
export const saveColumnVisibility = (pageName: string, columnKeys: string[]): void => {
  try {
    const key = `@airtrust/table-columns-${pageName}`;
    const state = { columns: columnKeys, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving column visibility:', error);
  }
};

/**
 * Load column visibility state from localStorage
 * @param pageName - Unique page identifier
 * @param defaultColumns - Default column keys if not found
 * @returns Array of visible column keys
 */
export const loadColumnVisibility = (pageName: string, defaultColumns: string[]): string[] => {
  try {
    const key = `@airtrust/table-columns-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return defaultColumns;

    const state = JSON.parse(stored);
    if (Array.isArray(state.columns) && state.columns.length > 0) {
      return state.columns;
    }
    return defaultColumns;
  } catch (error) {
    console.error('[StorageUtils] Error loading column visibility:', error);
    return defaultColumns;
  }
};

/**
 * Save column order to localStorage
 * @param pageName - Unique page identifier
 * @param columnOrder - Array of column keys in desired order
 */
export const saveColumnOrder = (pageName: string, columnOrder: string[]): void => {
  try {
    const key = `@airtrust/table-order-${pageName}`;
    const state = { order: columnOrder, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving column order:', error);
  }
};

/**
 * Load column order from localStorage
 * @param pageName - Unique page identifier
 * @param defaultOrder - Default column order if not found
 * @returns Array of column keys in saved order
 */
export const loadColumnOrder = (pageName: string, defaultOrder: string[]): string[] => {
  try {
    const key = `@airtrust/table-order-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return defaultOrder;

    const state = JSON.parse(stored);
    if (Array.isArray(state.order) && state.order.length > 0) {
      return state.order;
    }
    return defaultOrder;
  } catch (error) {
    console.error('[StorageUtils] Error loading column order:', error);
    return defaultOrder;
  }
};

/**
 * Save column widths to localStorage
 * @param pageName - Unique page identifier
 * @param widths - Object with column keys and their widths
 */
export const saveColumnWidths = (
  pageName: string,
  widths: Record<string, number>
): void => {
  try {
    const key = `@airtrust/table-widths-${pageName}`;
    const state = { widths, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error('[StorageUtils] Error saving column widths:', error);
  }
};

/**
 * Load column widths from localStorage
 * @param pageName - Unique page identifier
 * @returns Object with column widths or empty object if not found
 */
export const loadColumnWidths = (pageName: string): Record<string, number> => {
  try {
    const key = `@airtrust/table-widths-${pageName}`;
    const stored = localStorage.getItem(key);
    if (!stored) return {};

    const state = JSON.parse(stored);
    if (state.widths && typeof state.widths === 'object') {
      return state.widths;
    }
    return {};
  } catch (error) {
    console.error('[StorageUtils] Error loading column widths:', error);
    return {};
  }
};

/**
 * Clear all storage for a specific page
 * @param pageName - Unique page identifier
 */
export const clearPageStorage = (pageName: string): void => {
  try {
    const keys = [
      `@airtrust/table-sort-${pageName}`,
      `@airtrust/table-columns-${pageName}`,
      `@airtrust/table-order-${pageName}`,
      `@airtrust/table-widths-${pageName}`,
    ];

    keys.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`[StorageUtils] Error removing key ${key}:`, error);
      }
    });
  } catch (error) {
    console.error('[StorageUtils] Error clearing page storage:', error);
  }
};

/**
 * Get all storage keys for a page (for debugging)
 * @param pageName - Unique page identifier
 * @returns Array of storage keys for this page
 */
export const getPageStorageKeys = (pageName: string): string[] => {
  try {
    const prefix = `@airtrust/`;
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix) && key.includes(pageName)) {
        keys.push(key);
      }
    }

    return keys;
  } catch (error) {
    console.error('[StorageUtils] Error getting page storage keys:', error);
    return [];
  }
};

export default {
  saveSortState,
  loadSortState,
  saveColumnVisibility,
  loadColumnVisibility,
  saveColumnOrder,
  loadColumnOrder,
  saveColumnWidths,
  loadColumnWidths,
  clearPageStorage,
  getPageStorageKeys,
};
