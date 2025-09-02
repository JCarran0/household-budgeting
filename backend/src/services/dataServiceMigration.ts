/**
 * Migration helper to transition from JSONDataService to UnifiedDataService
 * This allows us to gradually migrate without breaking existing code
 */

import { JSONDataService } from './dataService';
import { UnifiedDataService } from './dataServiceV2';
import { StorageFactory } from './storage';

let dataServiceInstance: JSONDataService | UnifiedDataService | null = null;

/**
 * Get the appropriate data service based on environment
 * This function manages the transition between old and new implementations
 */
export function getDataService(): JSONDataService | UnifiedDataService {
  if (dataServiceInstance) {
    return dataServiceInstance;
  }

  // Check if we should use the new unified service
  const useNewService = process.env.USE_UNIFIED_STORAGE === 'true' || 
                        process.env.NODE_ENV === 'production';

  if (useNewService) {
    console.log('Using UnifiedDataService with storage adapter');
    dataServiceInstance = new UnifiedDataService();
  } else {
    console.log('Using legacy JSONDataService');
    dataServiceInstance = new JSONDataService();
  }

  return dataServiceInstance;
}

/**
 * Reset the service instance (mainly for testing)
 */
export function resetDataService(): void {
  dataServiceInstance = null;
  StorageFactory.reset();
}